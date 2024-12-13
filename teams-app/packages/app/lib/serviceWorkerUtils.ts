export type CustomAuthMessage = {
  accessToken: string;
  audience: string;
  authHeader?: string;
  authPrefix?: string;
  headerOverrides?: Record<string, string>;
};

const match = RegExp("/datasets/.*/samples");

// deregister all service workers when service worker is disabled in the session
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
        if (message.accessToken) {
          registration.active.postMessage(message);
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
    const base64Payload = token.split(".")[1];
    const decodedPayload = Buffer.from(base64Payload, "base64").toString(
      "utf-8"
    );
    return JSON.parse(decodedPayload);
  } catch (e) {
    console.error("Failed to parse token.", e);
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
  const accessToken = data?.customAccessToken || data?.accessToken;
  const audience = data?.accessTokenAudience;

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
    // Register and update the service worker
    try {
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register(
          `/service-worker.js`
        );
      }
      sessionStorage.setItem("serviceWorkerStatus", "registered");
      await registration.update();

      // Send a message to the service worker with the token immediately
      // in case the first session refresh takes awhile
      if (token) {
        const data = decodeToken(token);
        const message = getCustomAuthMessageFromData(data || {});
        if (message) {
          try {
            await sendMessageToServiceWorker(message);
          } catch (error) {
            console.error("Error sending message to service worker:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error during service worker registration:", error);
    }
  }
};
