"use client";

import { useEffect, useState } from "react";
import { hasAnyPendingWork } from "@/modules/attendance/offline/db";
import { getCurrentSession } from "@/lib/api/auth";
import { syncAttendance } from "@/modules/attendance/offline/sync";

export function PwaRegistrar() {
  const [updateHeld, setUpdateHeld] = useState(false);
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
        await syncAttendance(user.id);
      } catch {
        // The visible attendance UI explains pending authentication or connectivity states.
      } finally {
        active = false;
      }
    };
    const online = () => void trySync();
    const visible = () => {
      if (document.visibilityState === "visible") void trySync();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return updateHeld ? (
    <p className="pwa-update-notice" role="status">
      An application update is waiting. Synchronize attendance before updating.
    </p>
  ) : null;
}
