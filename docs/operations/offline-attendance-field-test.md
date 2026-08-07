# Offline attendance physical-device test

Use synthetic Workers and a non-production environment. Record phone model, OS/browser version, test time, roster size, and observations.

1. Install the Koranco PWA from the supported browser and launch it standalone.
2. Sign in online as the intended Supervisor; never test offline password entry.
3. Open Attendance and select **Prepare roster for offline use**. Confirm the displayed refresh time and expected Workers.
4. Start a draft and switch the phone to airplane mode.
5. Add and mark a representative large roster, including Present/Absent exceptions and optional times.
6. Save locally. Confirm the text says **Saved on this device**, not server-confirmed.
7. Lock the phone, wait, reopen the app, and confirm the roster remains.
8. Refresh/restart the browser and confirm the same owner can resume the roster.
9. Review and submit while offline. Confirm **Waiting to sync** and that casual editing is blocked.
10. Reconnect. Use **Sync now** if automatic reconnect synchronization has not completed. Confirm submitted/server-confirmed state.
11. Verify the API/management view contains exactly one session and one submission audit event.
12. If practical, repeat with low battery, forced app termination, and a connection dropped during sync; retry and verify no duplicate.
13. Create another pending record, attempt logout, verify the warning, then sign in as another user. Confirm the second user cannot see or synchronize it.
14. Confirm a pending operation delays application update activation and the notice is understandable.
15. Explain before testing that clearing site data, private/incognito mode, browser removal, OS eviction, or device loss can destroy unsynced work. Do not clear storage unless explicitly testing loss; no recovery should be promised.

Stop and preserve the device state if any roster disappears, ownership crosses accounts, local submission is labelled confirmed, or duplicate official attendance is created.

