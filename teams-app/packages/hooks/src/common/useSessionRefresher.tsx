import { SESSION_ENDPOINT } from "@fiftyone/teams-state/src/constants";
import { useCallback, useEffect, useRef } from "react";
import {
  sendMessageToServiceWorker,
  CustomAuthMessage,
  deregisterAllServiceWorkers,
} from "@fiftyone/teams-app/lib/serviceWorkerUtils";

const EARLY_REFRESH_WINDOW = 30 * 1000; // 30 seconds
const DEFAULT_REFRESH_INTERVAL = 60 * 1000; // 60 seconds

export default function useSessionRefresher() {
  const sessionTimerRef = useRef<NodeJS.Timeout>();
  const sessionExpRef = useRef<number | null>(null);

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

        await sendMessageToServiceWorker(message);

        sessionStorage.setItem("customCredentialsAudience", audience);
      }
    } catch (error) {
      console.error("Error fetching session:", error);
      sessionExpRef.current = null;
      console.log("Deregistering all service workers");
      deregisterAllServiceWorkers();
    }
  }, []); // No dependencies for this callback

  const initSessionRefresher = useCallback(() => {
    clearSessionTimer();
    sessionTimerRef.current = setInterval(
      getLatestSession,
      DEFAULT_REFRESH_INTERVAL
    );
    return clearSessionTimer;
  }, [clearSessionTimer, getLatestSession]);

  useEffect(() => {
    const cleanup = initSessionRefresher();
    return cleanup; // Ensures clearSessionTimer is called on unmount
  }, [initSessionRefresher]);

  return null; // The hook doesn't render anything
}
