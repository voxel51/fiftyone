import { withPermissions } from "@fiftyone/hooks";
import { useBooleanEnv } from "@fiftyone/hooks/src/common/useEnv";
import {
  ExecutionContext,
  resolveRemoteType,
} from "@fiftyone/operators/src/operators";
import { Property } from "@fiftyone/operators/src/types";
import {
  AutoRefresh,
  BackButton,
  Box,
  Timestamp,
} from "@fiftyone/teams-components";
import {
  VIEW_DATASET,
  runsItemQuery,
  runsItemQueryT,
  runsLogQuery,
  runsLogQueryT,
} from "@fiftyone/teams-state";
import {
  AUTO_REFRESH_INTERVAL_IN_SECONDS,
  FIFTYONE_ALLOW_LEGACY_ORCHESTRATORS_ENV_KEY,
  FIFTYONE_TEAMS_PROXY_ENDPOINT,
  OPERATOR_RUN_STATES,
} from "@fiftyone/teams-state/src/constants";
import * as fou from "@fiftyone/utilities";
import { Stack, Tab, TabProps, Tabs, Typography } from "@mui/material";
import withRelay from "lib/withRelay";
import { capitalize, get } from "lodash";
import { useEffect, useState } from "react";
import { usePreloadedQuery, useQueryLoader } from "react-relay";
import DatasetNavigation from "../../components/navigation";
import Logs from "../components/Logs";
import RunActions from "../components/RunActions";
import RunLabel from "../components/RunLabel";
import RunStatus from "../components/RunStatus";
import RunsPin from "../components/RunsPin";
import formatCtx from "../utils/formatCtx";
import getTimestamp from "../utils/getTimestamp";
import RunIO, { IOType } from "./components/RunIO";

const { QUEUED, SCHEDULED, RUNNING, COMPLETED, FAILED } = OPERATOR_RUN_STATES;

function Run(props) {
  const { preloadedQuery, refresh } = props;

  // Fetch run metadata including logSize
  const result = usePreloadedQuery<runsItemQueryT>(
    runsItemQuery,
    preloadedQuery
  );
  const runData = result.delegatedOperation;

  const timestamp = getTimestamp(runData);
  const [tab, setTab] = useState("inputs");
  const [schemas, setSchemas] = useState<{ inputs?: any; outputs?: any }>({});
  const [errors, setErrors] = useState<{ inputs?: Error; outputs?: Error }>({});
  const [logQueryRef, loadLogs] = useQueryLoader(runsLogQuery);
  const [logData, setLogData] = useState(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const {
    label,
    operator,
    runBy,
    runState,
    context,
    queuedAt,
    scheduledAt,
    startedAt,
    result: runResult,
    status,
    id,
    pinned,
    runLink,
    logUrl,
    logUploadError,
    logSize,
    metadata,
  } = runData;

  const { operator_uri, params, ...ctxData } = context.request_params;
  const { inputs, outputs } = schemas;
  const { inputs: inputError, outputs: outputError } = errors;
  const runResultData = get(runResult, "result");
  const runErrorData = get(runResult, "error");
  const showProgress =
    status !== null && runState === OPERATOR_RUN_STATES.RUNNING;
  const showOrchestrators = !useBooleanEnv(
    FIFTYONE_ALLOW_LEGACY_ORCHESTRATORS_ENV_KEY
  );
  const { inputs_schema, outputs_schema } = metadata || {};

  useEffect(() => {
    if (typeof window !== "undefined") {
      fou.setFetchFunction(
        window.location.origin,
        {},
        FIFTYONE_TEAMS_PROXY_ENDPOINT
      );
    }
    async function fetchIO(target: IOType) {
      setSchemas((schemas) => ({ ...schemas, [target]: "loading" }));
      const ctx = new ExecutionContext(params, formatCtx(ctxData));
      try {
        const io = await resolveRemoteType(operator_uri, ctx, target);
        const schema = io?.toProps();
        setSchemas((schemas) => ({ ...schemas, [target]: schema }));
      } catch (e) {
        setErrors((errors) => ({ ...errors, [target]: e }));
        setSchemas((schemas) => ({ ...schemas, [target]: undefined }));
      }
    }
    try {
      const inputs = Property.fromJSON(inputs_schema).toProps();
      setSchemas((schemas) => ({ ...schemas, inputs }));
    } catch (e) {
      fetchIO("inputs");
    }
    try {
      const outputs = Property.fromJSON(outputs_schema).toProps();
      setSchemas((schemas) => ({ ...schemas, outputs }));
    } catch (e) {
      fetchIO("outputs");
    }
  }, []);

  useEffect(() => {
    console.log("logSize", logSize);
    if (logSize !== null && logSize < 1 * 1024 * 1024) {
      setIsLoadingLogs(true);
      loadLogs({ run: id }, { fetchPolicy: "network-only" });
    }
  }, [logSize]);

  // Run the query when logQueryRef is available
  useEffect(() => {
    if (logQueryRef) {
      const data = usePreloadedQuery<runsLogQueryT>(runsLogQuery, logQueryRef);
      console.log("data", data);
      setLogData(data);
      setIsLoadingLogs(false);
    }
  }, [logQueryRef]);

  const runByName = runBy?.name;

  return (
    <Box>
      <Box>
        <DatasetNavigation />
      </Box>
      <Box
        sx={{ background: (theme) => theme.palette.background.primaryHover }}
      >
        <Stack px={2} pt={2} direction="row" alignItems="center" spacing={1}>
          <BackButton toName="all runs" />
          <Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <RunLabel id={id} label={label || operator} isHovering />
              <RunsPin
                id={id}
                pinned={pinned as boolean}
                isHovering
                pinProps={{
                  styles: {
                    pr: "5px",
                    pt: "3px",
                  },
                }}
              />
              <RunStatus
                status={runState}
                progress={showProgress ? status : undefined}
              />
              {runState === RUNNING && (
                <AutoRefresh
                  refresh={refresh}
                  title={`Auto refresh progress every ${AUTO_REFRESH_INTERVAL_IN_SECONDS} seconds`}
                  persistanceKey="auto_refresh_run_status"
                />
              )}
            </Stack>
            <Typography color="text.tertiary">{operator}</Typography>
            <Stack
              direction="row"
              spacing={1}
              divider={<Typography>·</Typography>}
            >
              {runByName && (
                <Typography color="secondary">Run by {runByName}</Typography>
              )}
              <Typography color="secondary">
                {runState === RUNNING ? "Started" : capitalize(runState)}{" "}
                <Timestamp timestamp={timestamp} />
              </Typography>
            </Stack>
          </Stack>
          <Box style={{ marginLeft: "auto" }}>
            <RunActions {...runData} hideViewInOrchestrator />
          </Box>
        </Stack>
        <Tabs value={tab} onChange={(e, tab) => setTab(tab)} sx={{ mx: 2 }}>
          <Tab label="Input" value="inputs" sx={{ ...TAB_SX, ml: 1 }} />
          <Tab label="Logs" value="logs" sx={TAB_SX} />
        </Tabs>
      </Box>
      <Box p={2}>
        {tab === "inputs" && (
          <RunIO
            property={inputs}
            data={params}
            error={inputError}
            type="inputs"
          />
        )}
        {tab === "logs" && logSize < 1 * 1024 * 1024 && logQueryRef && (
          <Logs logQueryRef={logQueryRef} />
        )}
        {tab === "logs" && logSize >= 1 * 1024 * 1024 && (
          <Typography>
            Log file too large to display. Download it instead.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default withRelay(
  withPermissions(Run, [VIEW_DATASET], "dataset"),
  runsItemQuery,
  { getLayoutProps: () => ({ topNavProps: { noBorder: true } }) }
);

const TAB_SX: TabProps["sx"] = {
  textTransform: "none",
  minWidth: "auto",
  px: 0,
  ml: 4,
};
