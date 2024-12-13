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
        if (message.accessToken) {
          registration.active.postMessage(message);
          console.info(
            "Sent message to service worker with latest credentials",
            message
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
    console.log("Checking service worker registration...");

    try {
      // Check if a service worker is already registered
      const existingRegistration =
        await navigator.serviceWorker.getRegistration();
      if (existingRegistration) {
        console.log("Service worker already registered.");
        sessionStorage.setItem("serviceWorkerStatus", "registered");

        // Update to the latest version if available
        await existingRegistration.update();
      } else {
        console.log("Registering new service worker...");
        const newRegistration = await navigator.serviceWorker.register(
          `/service-worker.js`
        );
        sessionStorage.setItem("serviceWorkerStatus", "registered");

        // Update to the latest version if necessary
        await newRegistration.update();
      }

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
  } else {
    console.log("Service worker registration skipped.");
  }
};
