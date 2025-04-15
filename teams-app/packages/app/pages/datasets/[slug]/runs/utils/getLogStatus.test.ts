import { describe, it, expect } from "vitest";
import { getLogStatus, LOG_STATUS } from "./getLogStatus";
import { OPERATOR_RUN_STATES } from "@fiftyone/teams-state/src/constants";
import { vi } from "vitest";

// Mock the isUrl function
vi.mock("./isUrl", () => ({
  default: (url: string) => url.startsWith("http"),
}));

describe("getLogStatus", () => {
  it("should return PENDING when run has not finished", () => {
    const result = getLogStatus({
      logUrl: "some-url",
      logPath: "some-path",
      logUploadError: null,
      runState: OPERATOR_RUN_STATES.RUNNING,
      result: null,
      runLink: null,
      logSize: 100,
    });
    expect(result).toBe(LOG_STATUS.PENDING);
  });

  it("should return UNSET when no log data is available but run has finished", () => {
    const result = getLogStatus({
      logUrl: null,
      logPath: null,
      logUploadError: null,
      runState: OPERATOR_RUN_STATES.COMPLETED,
      result: null,
      runLink: null,
      logSize: 0,
    });
    expect(result).toBe(LOG_STATUS.UNSET);
  });

  it("should NOT return UNSET when the user sets the logPath as as local path", () => {
    const result = getLogStatus({
      logUrl: null,
      logPath: "Home/user/logs",
      logUploadError: null,
      runState: OPERATOR_RUN_STATES.COMPLETED,
      result: null,
      runLink: null,
      logSize: 300,
    });
    expect(result == LOG_STATUS.UNSET).toBe(false);
  });

  it("should return URL_LINK when runLink is a valid URL and run has finished", () => {
    const result = getLogStatus({
      logUrl: null,
      logPath: null,
      logUploadError: null,
      runState: OPERATOR_RUN_STATES.COMPLETED,
      result: null,
      runLink: "http://example.com",
      logSize: 0,
    });
    expect(result).toBe(LOG_STATUS.URL_LINK);
  });

  it("should return UPLOAD_SUCCESS_LARGE_FILE when logSize is more than 1MB", () => {
    const result = getLogStatus({
      logUrl: "some-url",
      logPath: "some-path",
      logUploadError: null,
      runState: OPERATOR_RUN_STATES.COMPLETED,
      result: null,
      runLink: null,
      logSize: 2 * 1024 * 1024, // 2MB
    });
    expect(result).toBe(LOG_STATUS.UPLOAD_SUCCESS_LARGE_FILE);
  });

  it("should return UPLOAD_SUCCESS when logSize is less than 1MB", () => {
    const result = getLogStatus({
      logUrl: "some-url",
      logPath: "some-path",
      logUploadError: null,
      runState: OPERATOR_RUN_STATES.COMPLETED,
      result: null,
      runLink: null,
      logSize: 0.5 * 1024 * 1024, // 0.5MB
    });
    expect(result).toBe(LOG_STATUS.UPLOAD_SUCCESS);
  });

  it("should return UPLOAD_SUCCESS when logUrl is available and run has finished", () => {
    const result = getLogStatus({
      logUrl: "some-url",
      logPath: null,
      logUploadError: null,
      runState: OPERATOR_RUN_STATES.COMPLETED,
      result: null,
      runLink: null,
      logSize: 0,
    });
    expect(result).toBe(LOG_STATUS.UPLOAD_SUCCESS);
  });

  it("should return UPLOAD_ERROR when logUploadError is available", () => {
    const result = getLogStatus({
      logUrl: "some-url",
      logPath: "some-path",
      logUploadError: "some error",
      runState: OPERATOR_RUN_STATES.COMPLETED,
      result: null,
      runLink: null,
      logSize: 100,
    });
    expect(result).toBe(LOG_STATUS.UPLOAD_ERROR);
  });

  it("should handle FAILED run state as finished", () => {
    const result = getLogStatus({
      logUrl: "some-url",
      logPath: null,
      logUploadError: null,
      runState: OPERATOR_RUN_STATES.FAILED,
      result: null,
      runLink: null,
      logSize: 100,
    });
    expect(result).toBe(LOG_STATUS.UPLOAD_SUCCESS);
  });
});
