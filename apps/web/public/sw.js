const CACHE_NAME = "koranco-attendance-shell-v1";
const SHELL_ROUTES = ["/attendance", "/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ROUTES)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const isAsset = ["script", "style", "font", "image"].includes(
    request.destination,
  );
  const isAttendanceResource = url.pathname.startsWith("/attendance");
  const isAttendanceNavigation =
    request.mode === "navigate" && isAttendanceResource;
  if (!isAsset && !isAttendanceResource) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok)
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (isAttendanceNavigation) return await caches.match("/attendance");
        return Response.error();
      }),
  );
});
