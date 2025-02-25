import { runsItemQuery$dataT } from "@fiftyone/teams-state";
import { OPERATOR_RUN_STATES } from "@fiftyone/teams-state/src/constants";
import isUrl from "./isUrl";

type RunData = runsItemQuery$dataT["delegatedOperation"];
export const getLogStatus = (runData: RunData) => {
  const {
    logUrl,
    logUploadError,
    runState,
    result,
    runLink,
    logSize,
    logConnection,
  } = runData;

  debugger;

  const runHasFinished = [
    OPERATOR_RUN_STATES.COMPLETED,
    OPERATOR_RUN_STATES.FAILED,
  ].includes(runState);

  // when run has not finished yet, log is not available
  if (!runHasFinished) {
    return LOG_STATUS.PENDING;
  }

  // when log url is never configured, there is no logUrl
  if (!logUrl && !runLink && runHasFinished) {
    return LOG_STATUS.UNSET;
  }
  // when run has finished and user sets up airflow, show the run link
  if (runLink && isUrl(runLink) && runHasFinished) {
    return LOG_STATUS.URL_LINK;
  }
  // when the run has finished and log is uploaded successfully
  if (logUrl && !logUploadError && runHasFinished) {
    const largeFile = logConnection.edges.length === 1000;
    return largeFile
      ? LOG_STATUS.UPLOAD_SUCCESS_LARGE_FILE
      : LOG_STATUS.UPLOAD_SUCCESS;
  }

  if (logUploadError) {
    return LOG_STATUS.UPLOAD_ERROR;
  }
};

export const LOG_STATUS = {
  // not available scenarios:
  PENDING: "PENDING", // waiting for log
  URL_LINK: "URLLINK", // log is available via URL (airflow)
  UNSET: "UNSET", // not available

  UPLOAD_ERROR: "UPLOAD_ERROR", // error in uploading log
  UPLOAD_SUCCESS: "UPLOAD_SUCCESS", // log uploaded successfully
  UPLOAD_SUCCESS_LARGE_FILE: "UPLOAD_SUCCESS_LARGE_FILE", // log uploaded successfully but large file, no preview available
};

export type LogStatus = keyof typeof LOG_STATUS;
