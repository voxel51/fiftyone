import DoneIcon from "@mui/icons-material/Done";
import FeedbackIcon from "@mui/icons-material/Feedback";
import { CircularProgress, Typography } from "@mui/material";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { ALL_LOADING_COMPLETE } from "./hooks";
import {
  fo3dAssetsParseStatusThisSample,
  fo3dLoadingStatusThisSample,
} from "./state";
import { LoadingStatus } from "./types";

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
  const loadingStatus = useRecoilValue(fo3dLoadingStatusThisSample);

  const errorLogs = useMemo(() => {
    return logs.filter((log) => log.status === "error");
  }, [logs]);

  const isStillLoading = useMemo(() => {
    return (
      loadingStatus.status === LoadingStatus.STARTED ||
      loadingStatus.status === LoadingStatus.LOADING
    );
  }, [loadingStatus.status]);

  const isFinalStatusSuccess = useMemo(() => {
    return loadingStatus.status === LoadingStatus.SUCCESS;
  }, [loadingStatus.status]);

  const hasError = useMemo(() => {
    return loadingStatus.status === LoadingStatus.FAILED;
  }, [loadingStatus.status]);

  const indicatorIcon = useMemo(() => {
    if (loadingStatus.status === LoadingStatus.IDLE) {
      return null;
    }

    if (isStillLoading) {
      return <CircularProgress size={14} />;
    }

    if (isFinalStatusSuccess) {
      return <DoneIcon fontSize="small" style={{ color: "green" }} />;
    }

    if (hasError) {
      return <FeedbackIcon fontSize="small" style={{ color: "red" }} />;
    }

    return null;
  }, [loadingStatus.status, isStillLoading, isFinalStatusSuccess, hasError]);

  const statusMessage = useMemo(() => {
    if (loadingStatus.status === LoadingStatus.IDLE) {
      return null;
    }

    if (isStillLoading) {
      if (loadingStatus.currentUrl) {
        return `Loading: ${loadingStatus.currentUrl}`;
      }
      return "Loading assets...";
    }

    if (isFinalStatusSuccess) {
      return "All assets loaded successfully!";
    }

    if (hasError) {
      return loadingStatus.errorMessage || "Loading failed";
    }

    return null;
  }, [loadingStatus, isStillLoading, isFinalStatusSuccess, hasError]);

  if (loadingStatus.status === LoadingStatus.IDLE) {
    return null;
  }

  return (
    <LogContainer data-cy="looker3d-logs-action-bar">
      {indicatorIcon}
      <Typography
        variant="caption"
        fontSize={10}
        color={"GrayText"}
        style={{ marginLeft: "0.75em" }}
      >
        {statusMessage}
      </Typography>
    </LogContainer>
  );
};
