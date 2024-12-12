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

export const sendMessageToServiceWorker = async (
  message: CustomAuthMessage
) => {
  if (navigator.serviceWorker?.ready) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        registration.active.postMessage(message);
        if (message.accessToken) {
          console.info(
            "Sent message to service worker with latest credentials"
          );
        }
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

export function decodeToken(token: string) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch (e) {
    console.error("failed to parse token.", e);
    return null;
  }
}

export function getCustomAuthMessageFromData(data: {
  customAccessToken?: string;
  accessToken?: string;
  accessTokenAudience?: string;
  authHeader: string | undefined;
  authPrefix: string | undefined;
  headerOverrides: Record<string, string> | undefined;
}): CustomAuthMessage | null {
  const accessToken = data.customAccessToken || data.accessToken;
  const audience = data.accessTokenAudience;

  if (audience && accessToken) {
    const message: CustomAuthMessage = { accessToken, audience };

    if (data.authHeader) message.authHeader = data.authHeader;
    if (data.authPrefix) message.authPrefix = data.authPrefix;
    if (data.headerOverrides) message.headerOverrides = data.headerOverrides;

    return message;
  }
  return null;
}

// register, install, activate, and run the service worker for a certain path
export const registerServiceWorker = async (path: string, token?: string) => {
  const isSWAvailable = "serviceWorker" in navigator;
  if (isSWAvailable && match.test(path)) {
    const registration = await navigator.serviceWorker.register(
      `/service-worker.js`
    );
    sessionStorage.setItem("serviceWorkerStatus", "registered");
    // update to latest
    await registration.update();
    if (token) {
      const data = decodeToken(token);
      const message = getCustomAuthMessageFromData(data || {});
      if (message) {
        try {
          await sendMessageToServiceWorker(message);
        } catch (error) {
          console.error("Error sending message to service worker:", error);
        }
      } else {
        if (!match.test(path) && isSWAvailable) {
          sessionStorage.setItem("serviceWorkerStatus", "inactive");
        }
      }
      return null;
    }
  }
};
