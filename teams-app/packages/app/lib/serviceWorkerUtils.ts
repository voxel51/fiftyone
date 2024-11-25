export type CustomAuthMessage = {
  accessToken: string;
  audience: string;
  authHeader?: string;
  authPrefix?: string;
  headerOverrides?: Record<string, string>;
};

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

export const sendMessageToServiceWorker = async (
  message: CustomAuthMessage
) => {
  if (navigator.serviceWorker?.ready) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        console.log("Posting message to service worker:", message);
        registration.active.postMessage(message);
      } else {
        console.warn("No active service worker available");
      }
    } catch (error) {
      console.error("Error posting message to service worker:", error);
    }
  } else {
    console.warn("Service worker not ready or not supported");
  }
};
