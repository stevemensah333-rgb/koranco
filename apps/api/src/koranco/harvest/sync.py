import logging

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from koranco.harvest.models import HarvestRecord, HarvestSyncOperation
from koranco.harvest.schemas import HarvestSyncRequest, HarvestSyncResponse
from koranco.harvest.service import (
    create_draft,
    format_quantity,
    load_record,
    submit_record,
    update_draft,
)
from koranco.harvest.service import (
    response as harvest_response,
)
from koranco.identity.models import ApplicationUser

logger = logging.getLogger(__name__)
SUPPORTED_PAYLOAD_VERSION = 1


def _same_snapshot(record: HarvestRecord, payload: HarvestSyncRequest) -> bool:
    # compare the key semantic fields for equivalence
    if record.harvest_date != payload.harvest_date:
        return False
    if str(record.farm_unit_id) != str(payload.farm_unit_id):
        return False
    # normalize quantities to the canonical 3-decimal string used elsewhere
    server_q = format_quantity(record.quantity)
    client_q = format_quantity(payload.quantity)
    if server_q != client_q:
        return False
    if record.unit != payload.unit:
        return False
    return (record.notes or "") == (payload.notes or "")


def _response_from_stored(operation: HarvestSyncOperation) -> HarvestSyncResponse:
    return HarvestSyncResponse.model_validate(operation.result_data)


def _store_result(
    db: Session,
    *,
    payload: HarvestSyncRequest,
    actor: ApplicationUser,
    request_id: str | None,
    response: HarvestSyncResponse,
) -> HarvestSyncResponse:
    db.add(
        HarvestSyncOperation(
            operation_id=payload.operation_id,
            actor_user_id=actor.id,
            operation_type=payload.operation_type,
            harvest_record_id=payload.harvest_record_id,
            payload_version=payload.payload_version,
            result_status=response.result,
            result_data=response.model_dump(mode="json"),
            request_id=request_id,
        )
    )
    db.flush()
    logger.info(
        "harvest_sync_result operation_id=%s actor=%s target=%s type=%s result=%s request_id=%s",
        payload.operation_id,
        actor.id,
        payload.harvest_record_id,
        payload.operation_type,
        response.result,
        request_id,
    )
    return response


def ingest_sync_operation(
    db: Session,
    *,
    payload: HarvestSyncRequest,
    actor: ApplicationUser,
    request_id: str | None,
) -> HarvestSyncResponse:
    # advisory lock to serialize identical operation processing
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:operation_id, 0))"),
        {"operation_id": str(payload.operation_id)},
    )
    stored = db.scalar(
        select(HarvestSyncOperation).where(
            HarvestSyncOperation.operation_id == payload.operation_id
        )
    )
    if stored:
        if stored.actor_user_id != actor.id:
            return HarvestSyncResponse(
                operation_id=payload.operation_id,
                result="rejected",
                message="This pending harvest belongs to another user.",
            )
        replay = _response_from_stored(stored)
        if replay.result == "applied":
            replay.result = "already_applied"
        return replay
    if payload.payload_version != SUPPORTED_PAYLOAD_VERSION:
        return _store_result(
            db,
            payload=payload,
            actor=actor,
            request_id=request_id,
            response=HarvestSyncResponse(
                operation_id=payload.operation_id,
                result="rejected",
                message="This saved harvest version is not supported. Keep it on this device.",
            ),
        )
    record = db.scalar(select(HarvestRecord).where(HarvestRecord.id == payload.harvest_record_id))
    if record and record.created_by != actor.id:
        result = HarvestSyncResponse(
            operation_id=payload.operation_id,
            result="conflict",
            message="This harvest record belongs to another user.",
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    if record and record.status == "submitted":
        same = (
            record.harvest_date == payload.harvest_date
            and record.farm_unit_id == payload.farm_unit_id
            and str(record.quantity) == str(payload.quantity)
            and record.unit == payload.unit
            and (record.notes or "") == (payload.notes or "")
        )
        result = HarvestSyncResponse(
            operation_id=payload.operation_id,
            result="already_applied" if same else "conflict",
            message=(
                "Harvest is already confirmed on the server."
                if same
                else "Server harvest differs from the saved device copy."
            ),
            record=harvest_response(record) if same else None,
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    if record and record.version != payload.base_server_version:
        result = HarvestSyncResponse(
            operation_id=payload.operation_id,
            result="conflict",
            message="The server draft changed while this device was offline.",
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    audit_request_id = f"{request_id or 'sync'}:{payload.operation_id}"
    try:
        with db.begin_nested():
            if record is None:
                # create draft with client-supplied id
                create_draft(
                    db,
                    actor,
                    # reuse HarvestValues shape by building a minimal object
                    # compatible with create_draft
                    values=type(
                        "V",
                        (),
                        {
                            "harvest_date": payload.harvest_date,
                            "farm_unit_id": payload.farm_unit_id,
                            "quantity": payload.quantity,
                            "unit": payload.unit,
                            "notes": payload.notes,
                        },
                    )(),
                    request_id=audit_request_id,
                    record_id=payload.harvest_record_id,
                )
            locked = load_record(db, payload.harvest_record_id, for_update=True)
            # apply latest values as draft update and submit
            update_draft(
                db,
                locked,
                type(
                    "V",
                    (),
                    {
                        "harvest_date": payload.harvest_date,
                        "farm_unit_id": payload.farm_unit_id,
                        "quantity": payload.quantity,
                        "unit": payload.unit,
                        "notes": payload.notes,
                        "expected_version": locked.version,
                    },
                )(),
                locked.version,
            )
            submit_record(db, actor, locked, audit_request_id)
    except HTTPException as exc:
        result = HarvestSyncResponse(
            operation_id=payload.operation_id,
            result="conflict" if exc.status_code == 409 else "rejected",
            message=str(exc.detail),
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    except IntegrityError:
        result = HarvestSyncResponse(
            operation_id=payload.operation_id,
            result="conflict",
            message="Equivalent harvest record conflict or duplicate detected.",
        )
        return _store_result(
            db, payload=payload, actor=actor, request_id=request_id, response=result
        )
    confirmed = harvest_response(load_record(db, payload.harvest_record_id))
    result = HarvestSyncResponse(
        operation_id=payload.operation_id,
        result="applied",
        message="Harvest synchronized and confirmed.",
        record=confirmed,
    )
    return _store_result(db, payload=payload, actor=actor, request_id=request_id, response=result)
