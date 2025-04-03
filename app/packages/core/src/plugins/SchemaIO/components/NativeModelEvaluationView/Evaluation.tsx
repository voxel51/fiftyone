import { EditableLabel } from "@fiftyone/components";
import { ArrowBack, Close } from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import ActionMenu from "./ActionMenu";
import { COMPARE_KEY_SECONDARY_COLOR } from "./constants";
import Error from "./Error";
import ExecutionInfo from "./evaluation/Info";
import Overview from "./evaluation/overview";
import EvaluationScenarioAnalysis from "./evaluation/scenario";
import EvaluationIcon from "./EvaluationIcon";
import Status from "./Status";
import { tabStyles } from "./styles";
import { ConcreteEvaluationType } from "./Types";
import { computeSortedCompareKeys } from "./utils";

export default function Evaluation(props: EvaluationProps) {
  const {
    name,
    id,
    navigateBack,
    data,
    loadEvaluation,
    onChangeCompareKey,
    compareKey,
    setStatusEvent,
    statuses = {},
    onRename,
    loadScenario,
  } = props;
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState("overview");
  const [loadingCompare, setLoadingCompare] = useState(false);
  const evaluation = useMemo(() => {
    const evaluation = data?.[`evaluation_${name}`];
    return evaluation;
  }, [data]);
  const compareEvaluation = useMemo(() => {
    const evaluation = data?.[`evaluation_${compareKey}`];
    return evaluation;
  }, [data]);
  const evaluationError = useMemo(() => {
    const evaluation = data?.[`evaluation_${name}_error`];
    return evaluation;
  }, [data]);

  const compareKeys = useMemo(() => {
    const currentEval = data.evaluations.find((item) => item.key === name);
    const currentType = currentEval?.type || "";
    const currentMethod = currentEval?.method || "";
    const evaluations = data?.evaluations || [];

    return computeSortedCompareKeys(
      evaluations,
      name,
      currentType,
      currentMethod
    );
  }, [data, name]);

  const status = useMemo(() => {
    return statuses[id];
  }, [statuses, id]);
  const { can_edit_status } = data?.permissions || {};

  useEffect(() => {
    if (!evaluation) {
      loadEvaluation();
    }
  }, [evaluation]);

  useEffect(() => {
    if (!compareEvaluation && !loadingCompare && compareKey) {
      setLoadingCompare(true);
      loadEvaluation(compareKey);
    }
  }, [compareEvaluation, compareKey]);

  if (evaluationError) {
    return <Error onBack={navigateBack} />;
  }

  if (!evaluation) {
    return (
      <Box
        sx={{
          height: "50vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const evaluationInfo = evaluation.info;
  const evaluationConfig = evaluationInfo.config;
  const evaluationType = evaluationConfig.type;
  const evaluationMethod = evaluationConfig.method;

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between" }}>
        <Stack
          id="evaluation-header"
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
            flex: 1,
            "& > *": {
              marginLeft: "0px !important",
            },
          }}
        >
          <IconButton
            onClick={() => {
              navigateBack();
            }}
            sx={{ pl: 0 }}
          >
            <ArrowBack />
          </IconButton>

          {/* First evaluation section */}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <EvaluationIcon type={evaluationType} method={evaluationMethod} />
            <EditableLabel
              label={name}
              onSave={(newLabel) => {
                onRename(name, newLabel);
              }}
              onCancel={() => {}}
              showEditIcon={!compareKey}
            />
          </Stack>

          {/* VS text */}
          <Typography
            variant="body2"
            sx={{
              color: (theme) => theme.palette.text.secondary,
              px: 1,
            }}
          >
            vs
          </Typography>

          {/* Compare dropdown section */}
          <Stack sx={{ minWidth: 225 }}>
            {compareKeys.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ color: (theme) => theme.palette.text.secondary }}
              >
                You need at least one more evaluation to compare.
              </Typography>
            ) : (
              <Select
                key={compareKey}
                sx={{
                  height: 40,
                  width: "100%",
                  minWidth: 225,
                  background: theme.palette.background.paper,
                  "& .MuiOutlinedInput-input": {
                    display: "flex",
                    alignItems: "center",
                  },
                  "& .MuiOutlinedInput-notchedOutline": {
                    border: "none",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    border: "none",
                  },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    border: "none",
                  },
                }}
                defaultValue={compareKey}
                displayEmpty
                placeholder="Select a comparison"
                renderValue={
                  !compareKey
                    ? () => (
                        <Typography sx={{ color: "text.secondary" }}>
                          Select a comparison
                        </Typography>
                      )
                    : undefined
                }
                onChange={(e) => {
                  setLoadingCompare(false);
                  onChangeCompareKey(e.target.value as string);
                }}
                endAdornment={
                  compareKey ? (
                    <IconButton
                      sx={{ mr: 1 }}
                      onClick={() => {
                        onChangeCompareKey("");
                      }}
                    >
                      <Close />
                    </IconButton>
                  ) : null
                }
              >
                {compareKeys.map(
                  ({ key, type, method, disabled, tooltip, tooltipBody }) => {
                    const menuItem = (
                      <MenuItem
                        value={key}
                        key={key}
                        sx={{ p: 0 }}
                        disabled={disabled}
                      >
                        <EvaluationIcon
                          type={type as ConcreteEvaluationType}
                          method={method}
                          color={COMPARE_KEY_SECONDARY_COLOR}
                        />
                        <Typography>{key}</Typography>
                      </MenuItem>
                    );
                    return disabled ? (
                      <Tooltip
                        key={key}
                        title={
                          <>
                            <Typography variant="subtitle1">
                              {tooltip}
                            </Typography>
                            <Typography variant="body2">
                              {tooltipBody}
                            </Typography>
                          </>
                        }
                      >
                        <span>{menuItem}</span>
                      </Tooltip>
                    ) : (
                      menuItem
                    );
                  }
                )}
              </Select>
            )}
          </Stack>
        </Stack>

        <Stack direction="row" sx={{ alignItems: "center" }}>
          <Status
            setStatusEvent={setStatusEvent}
            status={status}
            canEdit={can_edit_status}
          />
          {!compareKey && <ActionMenu evaluationName={evaluation.info.key} />}
        </Stack>
      </Stack>

      <Box sx={tabStyles.container}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          TabIndicatorProps={{
            style: { display: "none" },
          }}
          variant="fullWidth"
          sx={tabStyles.tabs}
        >
          <Tab label="Overview" value="overview" />
          <Tab label="Scenario Analysis" value="scenario" />
          <Tab label="Execution Info" value="info" />
        </Tabs>
      </Box>

      {/* Overview tab */}
      {activeTab === "overview" && <Overview {...props} />}

      {/* Scenario tab */}
      {activeTab === "scenario" && (
        <EvaluationScenarioAnalysis
          evaluation={evaluation}
          data={data}
          loadScenario={loadScenario}
        />
      )}

      {/* Info tab */}
      {activeTab === "info" && (
        <ExecutionInfo
          name={name}
          compareKey={compareKey}
          evaluation={evaluation}
          compareEvaluation={compareEvaluation}
        />
      )}
    </Stack>
  );
}

type EvaluationProps = {
  name: string;
  id: string;
  navigateBack: () => void;
  loadEvaluation: (key?: string) => void;
  loadScenario: (id?: string, subset?: string) => void;
  onChangeCompareKey: (compareKey: string) => void;
  compareKey?: string;
  data: any;
  setStatusEvent: string;
  statuses: Record<string, string>;
  setNoteEvent: string;
  notes: Record<string, string>;
  loadView: (type: string, params: any) => void;
  onRename: (oldName: string, newName: string) => void;
};
