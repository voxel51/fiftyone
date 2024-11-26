import { SESSION_ENDPOINT } from "@fiftyone/teams-state/src/constants";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  CustomAuthMessage,
  deregisterAllServiceWorkers,
  sendMessageToServiceWorker,
} from "@fiftyone/teams-app/lib/serviceWorkerUtils";

// Early refresh window must be less than the refresh interval to prevent infinite loops
const EARLY_REFRESH_WINDOW = 30 * 1000; // 30 seconds
const DEFAULT_REFRESH_INTERVAL = 60 * 1000; // 60 seconds

export default function useSessionRefresher() {
  const sessionTimerRef = useRef<NodeJS.Timeout>();
  const sessionExpRef = useRef<number | null>(null);
  const customCredsRef = useRef<CustomAuthMessage | null>(null);

  const clearSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }
  }, []);

  const getLatestSession = useCallback(async () => {
    const sessionExp = sessionExpRef.current;
    if (
      typeof sessionExp === "number" &&
      sessionExp - Date.now() > EARLY_REFRESH_WINDOW
    ) {
      if (
        sessionStorage?.getItem("serviceWorkerStatus") !== "ready" &&
        customCredsRef.current
      ) {
        console.log("Service worker is active but not ready. Sending token");
        await sendMessageToServiceWorker(customCredsRef.current);
        sessionStorage.setItem(
          "customCredentialsAudience",
          customCredsRef.current.audience
        );
        sessionStorage.setItem("serviceWorkerStatus", "ready");
      }
      return; // no need to refresh just yet
    }
    try {
      const response = await fetch(SESSION_ENDPOINT);
      const data = await response.json();
      sessionExpRef.current = data.exp * 1000;

      // Check for custom access token that enables overriding the one returned by the auth provider
      const accessToken = data.customAccessToken || data.accessToken;
      const audience = data.accessTokenAudience;

      if (audience) {
        const message: CustomAuthMessage = { accessToken, audience };

        if (data.authHeader) message.authHeader = data.authHeader;
        if (data.authPrefix) message.authPrefix = data.authPrefix;
        if (data.headerOverrides)
          message.headerOverrides = data.headerOverrides;

        customCredsRef.current = message;

        await sendMessageToServiceWorker(message);

        sessionStorage.setItem("customCredentialsAudience", audience);
        sessionStorage.setItem("serviceWorkerStatus", "ready");
      } else {
        customCredsRef.current = null;
        console.log("Disabling all service workers");
        deregisterAllServiceWorkers();
        sessionStorage.setItem("serviceWorkerStatus", "disabled");
      }
    } catch (error) {
      console.error("Error fetching session:", error);
      sessionExpRef.current = null;
      console.log("Disabling all service workers");
      deregisterAllServiceWorkers();
      sessionStorage.setItem("serviceWorkerStatus", "disabled");
    }
  }, []);

  const initSessionRefresher = useCallback(() => {
    clearSessionTimer();
    sessionTimerRef.current = setInterval(
      getLatestSession,
      DEFAULT_REFRESH_INTERVAL
    );
    return clearSessionTimer;
  }, [clearSessionTimer, getLatestSession]);

  useLayoutEffect(() => {
    return initSessionRefresher(); // Ensures clearSessionTimer is called on unmount
  }, [initSessionRefresher]);

  return null;
}
