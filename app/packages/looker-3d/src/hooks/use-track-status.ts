import { useRecoilState } from "recoil";
import * as THREE from "three";
import { fo3dAssetsParseStatusThisSample } from "../state";

export const ALL_LOADING_COMPLETE = "All loading complete!";

export const useTrackStatus = () => {
  const [logs, setLogs] = useRecoilState(fo3dAssetsParseStatusThisSample);

  THREE.DefaultLoadingManager.onStart = (url) => {
    const log = "Started loading file: " + url;

    setLogs([...logs, { message: log, status: "info" }]);
  };

  THREE.DefaultLoadingManager.onLoad = () => {
    const log = ALL_LOADING_COMPLETE;
    setLogs([...logs, { message: log, status: "success" }]);
  };

  THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const log = `Loading file: ${url}. Loaded ${itemsLoaded} of ${itemsTotal} files.`;

    setLogs([...logs, { message: log, status: "info" }]);
  };

  THREE.DefaultLoadingManager.onError = (url) => {
    const log = "There was an error loading " + url;
    setLogs([...logs, { message: log, status: "error" }]);
  };
};
