import { SESSION_ENDPOINT } from "@fiftyone/teams-state/src/constants";
import { useCallback, useEffect, useRef } from "react";

const EARLY_REFRESH_WINDOW = 60 * 1000; // 60 seconds
const REFRESH_INTERVAL = 30 * 1000; // 30 seconds

export default function useSessionRefresher() {
  const sessionTimerRef = useRef<NodeJS.Timer>();
  const sessionExpRef = useRef<number>(null);

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
    } catch (error) {
      sessionExpRef.current = null;
      console.error(error);
    }
  }, []);

  const initSessionRefresher = useCallback(() => {
    clearSessionTimer();
    sessionTimerRef.current = setInterval(getLatestSession, REFRESH_INTERVAL);
    return clearSessionTimer;
  }, []);

  useEffect(() => {
    initSessionRefresher();
  }, []);
}
