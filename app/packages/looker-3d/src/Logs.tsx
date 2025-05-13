import DoneIcon from "@mui/icons-material/Done";
import FeedbackIcon from "@mui/icons-material/Feedback";
import { CircularProgress, Typography } from "@mui/material";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { ALL_LOADING_COMPLETE } from "./hooks";
import { fo3dAssetsParseStatusThisSample } from "./state";

const LogContainer = styled.div`
  width: 70%;
  margin-left: 0.25em;
  display: flex;
  align-content: center;
  overflow: hidden;
  align-items: center;
`;

export const Logs = () => {
  const logs = useRecoilValue(fo3dAssetsParseStatusThisSample);

  const errorLogs = useMemo(() => {
    return logs.filter((log) => log.status === "error");
  }, [logs]);

  const isStillLoading = useMemo(() => {
    if (logs.length === 0) {
      return false;
    }

    if (logs[logs.length - 1].status === "error") {
      return false;
    }

    return logs[logs.length - 1].message !== ALL_LOADING_COMPLETE;
  }, [logs]);

  const isFinalStatusSuccess = useMemo(() => {
    if (logs.some((log) => log.status === "error")) {
      return false;
    }

    return true;
  }, [logs]);

  const loadingTimeMs = useMemo(() => {
    if (logs.length === 0 || !isFinalStatusSuccess) {
      return 0;
    }

    const firstLogWithTimestamp = logs.find(
      (log) => log.timestamp !== undefined
    );
    const successLog = logs.find(
      (log) =>
        log.message === ALL_LOADING_COMPLETE && log.timestamp !== undefined
    );

    if (firstLogWithTimestamp && successLog) {
      return successLog.timestamp - firstLogWithTimestamp.timestamp;
    }

    return 0;
  }, [logs, isFinalStatusSuccess]);

  const formattedLoadingTime = useMemo(() => {
    if (loadingTimeMs === 0) {
      return "";
    }

    if (loadingTimeMs < 1000) {
      return `(${loadingTimeMs}ms)`;
    }

    return `(${(loadingTimeMs / 1000).toFixed(2)}s)`;
  }, [loadingTimeMs]);

  const indicatorIcon = useMemo(() => {
    if (logs.length === 0) {
      return null;
    }

    if (isStillLoading) {
      return <CircularProgress size={14} />;
    }

    if (isFinalStatusSuccess) {
      return <DoneIcon fontSize="small" style={{ color: "green" }} />;
    }

    return <FeedbackIcon fontSize="small" style={{ color: "red" }} />;
  }, [logs, isFinalStatusSuccess, isStillLoading]);

  if (logs.length === 0) {
    return null;
  }

  return (
    <LogContainer>
      {indicatorIcon}
      <Typography
        variant="caption"
        fontSize={10}
        color={"GrayText"}
        style={{ marginLeft: "0.75em" }}
      >
        {isStillLoading
          ? logs[logs.length - 1].message
          : isFinalStatusSuccess
          ? `All assets loaded successfully! ${formattedLoadingTime}`
          : errorLogs[errorLogs.length - 1].message}
      </Typography>
    </LogContainer>
  );
};
