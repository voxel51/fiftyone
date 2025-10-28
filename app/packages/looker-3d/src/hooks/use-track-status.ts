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

  THREE.DefaultLoadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
    const log = "Started loading file: " + url;
    setLogs([...logs, { message: log, status: "info" }]);

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
    setLogs([...logs, { message: log, status: "success" }]);

    setLoadingStatus({
      status: LoadingStatus.SUCCESS,
      progress: 100,
      itemsLoaded: loadingStatus.itemsTotal || 0,
      itemsTotal: loadingStatus.itemsTotal || 0,
      timestamp: Date.now(),
    });
  };

  THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const log = `Loading file: ${url}. Loaded ${itemsLoaded} of ${itemsTotal} files.`;
    setLogs([...logs, { message: log, status: "info" }]);

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
    setLogs([...logs, { message: log, status: "error" }]);

    setLoadingStatus({
      status: LoadingStatus.FAILED,
      currentUrl: url,
      errorMessage: log,
      timestamp: Date.now(),
    });
  };
};
