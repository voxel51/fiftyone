import type { LoadingManager } from "three";
import { useEffect, useRef } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import {
  fo3dAssetsParseStatusThisSample,
  fo3dLoadingStatusThisSample,
} from "../state";
import { LoadingStatus } from "../types";
import { useLoadingStatus } from "./use-loading-status";

export const ALL_LOADING_COMPLETE = "All loading complete!";
const noop = () => undefined;

/** Tracks THREE loading-manager events and mirrors status/logs into Recoil. */
export const useTrackStatus = (
  loadingManager: LoadingManager | null,
  isSceneReady = false
) => {
  const loadingStatusView = useLoadingStatus();
  const setLogs = useSetRecoilState(fo3dAssetsParseStatusThisSample);
  const [loadingStatusState, setLoadingStatus] = useRecoilState(
    fo3dLoadingStatusThisSample
  );

  // Keep a ref to the latest loadingStatus to avoid stale closures
  const loadingStatusRef = useRef(loadingStatusState);
  loadingStatusRef.current = loadingStatusState;

  useEffect(() => {
    setLogs([]);
    setLoadingStatus({
      status: LoadingStatus.IDLE,
      timestamp: Date.now(),
    });
  }, [loadingManager, setLoadingStatus, setLogs]);

  useEffect(() => {
    if (!isSceneReady || loadingStatusState.status !== LoadingStatus.IDLE) {
      return;
    }

    setLoadingStatus({
      status: LoadingStatus.SUCCESS,
      progress: 100,
      itemsLoaded: loadingStatusState.itemsLoaded || 0,
      itemsTotal: loadingStatusState.itemsTotal || 0,
      timestamp: Date.now(),
    });
  }, [
    isSceneReady,
    loadingStatusState.itemsLoaded,
    loadingStatusState.itemsTotal,
    loadingStatusState.status,
    setLoadingStatus,
  ]);

  useEffect(() => {
    if (!loadingManager) {
      return;
    }

    let active = true;

    // Note: these callbacks can fire synchronously during React's render phase
    // (e.g. when useLoader triggers a THREE loader).
    // We defer state updates with queueMicrotask to avoid the React warning:
    loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        const log = "Started loading file: " + url;
        setLogs((prevLogs) => [...prevLogs, { message: log, status: "info" }]);

        setLoadingStatus({
          status: LoadingStatus.STARTED,
          currentUrl: url,
          itemsLoaded,
          itemsTotal,
          progress: itemsTotal > 0 ? (itemsLoaded / itemsTotal) * 100 : 0,
          timestamp: Date.now(),
        });
      });
    };

    loadingManager.onLoad = () => {
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        const log = ALL_LOADING_COMPLETE;
        setLogs((prevLogs) => [
          ...prevLogs,
          { message: log, status: "success" },
        ]);

        const latestItemsTotal = loadingStatusRef.current.itemsTotal || 0;
        setLoadingStatus({
          status: LoadingStatus.SUCCESS,
          progress: 100,
          itemsLoaded: latestItemsTotal,
          itemsTotal: latestItemsTotal,
          timestamp: Date.now(),
        });
      });
    };

    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        const log = `Loading file: ${url}. Loaded ${itemsLoaded} of ${itemsTotal} files.`;
        setLogs((prevLogs) => [...prevLogs, { message: log, status: "info" }]);

        setLoadingStatus({
          status: LoadingStatus.LOADING,
          currentUrl: url,
          itemsLoaded,
          itemsTotal,
          progress: itemsTotal > 0 ? (itemsLoaded / itemsTotal) * 100 : 0,
          timestamp: Date.now(),
        });
      });
    };

    loadingManager.onError = (url) => {
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        const log = "There was an error loading " + url;
        setLogs((prevLogs) => [...prevLogs, { message: log, status: "error" }]);

        setLoadingStatus({
          status: LoadingStatus.FAILED,
          currentUrl: url,
          errorMessage: log,
          timestamp: Date.now(),
        });
      });
    };

    return () => {
      active = false;
      loadingManager.onStart = noop;
      loadingManager.onLoad = noop;
      loadingManager.onProgress = noop;
      loadingManager.onError = noop;
    };
  }, [loadingManager, setLoadingStatus, setLogs]);

  return loadingStatusView;
};
