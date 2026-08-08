"use client";

import { useEffect, useState } from "react";

import { getCurrentSession } from "@/lib/api/auth";
import {
  hasAnyPendingWork,
  pendingCounts,
} from "@/modules/attendance/offline/db";
import { syncAttendance } from "@/modules/attendance/offline/sync";
import { syncHarvest } from "@/modules/harvest/offline/sync";

export function PwaRegistrar() {
  const [updateHeld, setUpdateHeld] = useState(false);
  const [pending, setPending] = useState({
    attendance: 0,
    harvest: 0,
    total: 0,
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((value) => {
      registration = value;
      const considerUpdate = async () => {
        if (!registration?.waiting) return;
        if (await hasAnyPendingWork()) setUpdateHeld(true);
        else registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
      };
      void considerUpdate();
      registration.addEventListener("updatefound", () => {
        registration?.installing?.addEventListener(
          "statechange",
          () => void considerUpdate(),
        );
      });
    });
    const visible = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, []);

  useEffect(() => {
    let active = false;
    const trySync = async () => {
      if (active) return;
      active = true;
      try {
        const user = await getCurrentSession();
        setPending(await pendingCounts(user.id));
        await Promise.all([syncAttendance(user.id), syncHarvest(user.id)]);
        setPending(await pendingCounts(user.id));
      } catch {
        // Domain screens explain authentication, connectivity, and attention states.
      } finally {
        active = false;
      }
    };
    const online = () => void trySync();
    const visible = () => {
      if (document.visibilityState === "visible") void trySync();
    };
    void trySync();
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  return (
    <>
      {pending.total ? (
        <p className="pwa-sync-notice" role="status">
          Waiting to sync: {pending.attendance} Attendance · {pending.harvest}{" "}
          Harvest
        </p>
      ) : null}
      {updateHeld ? (
        <p className="pwa-update-notice" role="status">
          An application update is waiting. Synchronize field records before
          updating.
        </p>
      ) : null}
    </>
  );
}
