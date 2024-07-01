import { currentSampleId } from "@fiftyone/state";
import { useRecoilState, useRecoilValue } from "recoil";
import * as THREE from "three";
import { fo3dAssetsParseStatusLog } from "../state";

export const ALL_LOADING_COMPLETE = "All loading complete!";

export const useTrackStatus = () => {
  const currentSample = useRecoilValue(currentSampleId);
  const [logs, setLogs] = useRecoilState(
    fo3dAssetsParseStatusLog(currentSample)
  );

  THREE.DefaultLoadingManager.onStart = function (url) {
    const log = "Started loading file: " + url;

    setLogs([...logs, { message: log, status: "info" }]);
  };

  THREE.DefaultLoadingManager.onLoad = function () {
    const log = ALL_LOADING_COMPLETE;
    setLogs([...logs, { message: log, status: "success" }]);
  };

  THREE.DefaultLoadingManager.onProgress = function (
    url,
    itemsLoaded,
    itemsTotal
  ) {
    const log = `Loading file: ${url}. Loaded ${itemsLoaded} of ${itemsTotal} files.`;

    setLogs([...logs, { message: log, status: "info" }]);
  };

  THREE.DefaultLoadingManager.onError = function (url) {
    const log = "There was an error loading " + url;
    setLogs([...logs, { message: log, status: "error" }]);
  };
};
