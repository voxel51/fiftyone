export const getLogStatus = () => {};

export const LOG_STATUS = {
  // not available scenarios:
  PENDING: "PENDING", // waiting for log
  URL_LINK: "URLLINK", // log is available via URL (airflow)
  UNSET: "UNSET", // not available

  UPLOAD_ERROR: "UPLOAD_ERROR", // error in uploading log

  UPLOAD_SUCCESS: "UPLOAD_SUCCESS", // log uploaded successfully
  UPLOAD_SUCCESS_LARGE_FILE: "UPLOAD_SUCCESS_LARGE_FILE", // log uploaded successfully but large file, no preview available

  UPLOAD_NOT_CONFIGURED: "UPLOAD_NOT_CONFIGURED", // log upload not configured
  UPLOAD_NOT_AVAILABLE: "UPLOAD_NOT_AVAILABLE", // log upload not available
  UPLOAD_NOT_PUBLISHED: "UPLOAD_NOT_PUBLISHED", // log upload not published
};

export type LogStatus = keyof typeof LOG_STATUS;
