import { useRef } from "react";
import { useRecoilState } from "recoil";
import * as THREE from "three";
import {
  fo3dAssetsParseStatusThisSample,
  fo3dLoadingStatusThisSample,
} from "../state";
import { LoadingStatus } from "../types";

export const ALL_LOADING_COMPLETE = "All loading complete!";

export const useTrackStatus = () => {
  const [logs, setLogs] = useRecoilState(fo3dAssetsParseStatusThisSample);
  const [loadingStatus, setLoadingStatus] = useRecoilState(
    fo3dLoadingStatusThisSample
  );

  // Keep a ref to the latest loadingStatus to avoid stale closures
  const loadingStatusRef = useRef(loadingStatus);
  loadingStatusRef.current = loadingStatus;

  THREE.DefaultLoadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
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
  };

  THREE.DefaultLoadingManager.onLoad = () => {
    const log = ALL_LOADING_COMPLETE;
    setLogs((prevLogs) => [...prevLogs, { message: log, status: "success" }]);

    const latestItemsTotal = loadingStatusRef.current.itemsTotal || 0;
    setLoadingStatus({
      status: LoadingStatus.SUCCESS,
      progress: 100,
      itemsLoaded: latestItemsTotal,
      itemsTotal: latestItemsTotal,
      timestamp: Date.now(),
    });
  };

  THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
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
  };

  THREE.DefaultLoadingManager.onError = (url) => {
    const log = "There was an error loading " + url;
    setLogs((prevLogs) => [...prevLogs, { message: log, status: "error" }]);

    setLoadingStatus({
      status: LoadingStatus.FAILED,
      currentUrl: url,
      errorMessage: log,
      timestamp: Date.now(),
    });
  };
};
