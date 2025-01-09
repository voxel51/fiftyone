import { SESSION_ENDPOINT } from "@fiftyone/teams-state/src/constants";
import { useCallback, useEffect, useRef } from "react";
import {
  CustomAuthMessage,
  deregisterAllServiceWorkers,
  getCustomAuthMessageFromData,
  sendMessageToServiceWorker,
} from "@fiftyone/teams-app/lib/serviceWorkerUtils";

// Early refresh window must be less than the refresh interval to prevent infinite loops
const EARLY_REFRESH_WINDOW = 30 * 1000; // 30 seconds
const DEFAULT_REFRESH_INTERVAL = 60 * 1000; // 60 seconds

export default function useSessionRefresher() {
  const sessionTimerRef = useRef<NodeJS.Timeout>();
  const sessionExpRef = useRef<number | null>(null);
  const customCredsRef = useRef<CustomAuthMessage | null>(null);
  const serviceWorkerStatus = sessionStorage?.getItem("serviceWorkerStatus");

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
        serviceWorkerStatus !== "disabled" &&
        customCredsRef.current?.accessToken
      ) {
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

      const message = getCustomAuthMessageFromData(data);

      if (message) {
        customCredsRef.current = message;
        await sendMessageToServiceWorker(message);

        sessionStorage.setItem("customCredentialsAudience", message.audience);
        sessionStorage.setItem("serviceWorkerStatus", "ready");
      }
    } catch (error) {
      // If there's an error fetching the session,
      // disable the service worker to prevent issues being compounded
      console.error("Error fetching session:", error);
      sessionExpRef.current = null;
      sessionStorage.setItem("serviceWorkerStatus", "error");
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

  useEffect(() => {
    return initSessionRefresher();
  }, [initSessionRefresher]);

  return null;
}
