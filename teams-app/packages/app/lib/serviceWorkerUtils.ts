const match = RegExp("/datasets/.*/samples");

// All pages except the embedded dataset/samples page
// deregister the worker to avoid unintended issues
export const deregisterAllServiceWorkers = () => {
  const isSWAvailable = "serviceWorker" in navigator;
  if (isSWAvailable) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (let registration of registrations) {
        registration.unregister();
      }
    });
  }
};

// register, install, activate, and run the service worker for a certain path
export const registerServiceWorker = async (
  path: string,
  token?: string,
  serviceWorkerHeaderKey?: string
) => {
  const isSWAvailable = "serviceWorker" in navigator;
  if (isSWAvailable && match.test(path)) {
    if (token) {
      const registration = await navigator.serviceWorker.register(
        `/service-worker.js?token=${
          token ? encodeURIComponent(token) : ""
        }&tokenKey=${encodeURIComponent(serviceWorkerHeaderKey || "jwt")}`
      );
      // update to latest
      return registration.update();
    } else {
      deregisterAllServiceWorkers();
    }
  } else {
    if (!match.test(path) && isSWAvailable) {
      deregisterAllServiceWorkers();
    }
  }
  return null;
};
