import { Dialog, EditableLabel } from "@fiftyone/components";
import { editingFieldAtom, view } from "@fiftyone/state";
import {
  ArrowBack,
  ArrowDropDown,
  ArrowDropUp,
  Close,
  EditNote,
  ExpandMore,
  GridView,
  Info,
  InsertChart,
  Settings,
  TableRows,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  styled,
  SxProps,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
  Tabs,
  Tab,
} from "@mui/material";
import get from "lodash/get";
import React, { useEffect, useMemo, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import ActionMenu from "./ActionMenu";
import Error from "./Error";
import EvaluationIcon from "./EvaluationIcon";
import EvaluationNotes from "./EvaluationNotes";
import EvaluationPlot from "./EvaluationPlot";
import EvaluationScenarioAnalysis from "./EvaluationScenarioAnalysis";
import Status from "./Status";
import { ConcreteEvaluationType } from "./Types";
import {
  computeSortedCompareKeys,
  formatValue,
  getNumericDifference,
  useTriggerEvent,
} from "./utils";
import {
  KEY_COLOR,
  COMPARE_KEY_COLOR,
  COMPARE_KEY_SECONDARY_COLOR,
  tabStyles,
} from "./styles";
import Overview from "./tabs/Overview";
import ScenarioAnalysis from "./tabs/ScenarioAnalysis";
import ExecutionInfo from "./tabs/ExecutionInfo";

const DEFAULT_BAR_CONFIG = { sortBy: "default" };
const NONE_CLASS = "(none)";

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
    setNoteEvent,
    notes = {},
    loadView,
    onRename,
    loadScenario,
  } = props;
  const theme = useTheme();
  const [expanded, setExpanded] = React.useState("summary");
  const [editNoteState, setEditNoteState] = useState({ open: false, note: "" });
  const [classPerformanceConfig, setClassPerformanceConfig] =
    useState<PLOT_CONFIG_TYPE>({});
  const [classPerformanceDialogConfig, setClassPerformanceDialogConfig] =
    useState<PLOT_CONFIG_DIALOG_TYPE>(DEFAULT_BAR_CONFIG);
  const [confusionMatrixConfig, setConfusionMatrixConfig] =
    useState<PLOT_CONFIG_TYPE>({ log: true });
  const [confusionMatrixDialogConfig, setConfusionMatrixDialogConfig] =
    useState<PLOT_CONFIG_DIALOG_TYPE>(DEFAULT_BAR_CONFIG);
  const [metricMode, setMetricMode] = useState("chart");
  const [classMode, setClassMode] = useState("chart");
  const [performanceClass, setPerformanceClass] = useState("precision");
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const evaluation = useMemo(() => {
    return data?.[`evaluation_${name}`];
  }, [data]);

  const compareEvaluation = useMemo(() => {
    return data?.[`evaluation_${compareKey}`];
  }, [data]);

  const evaluationError = useMemo(() => {
    return data?.[`evaluation_${name}_error`];
  }, [data]);

  const compareEvaluationError = useMemo(() => {
    return data?.[`evaluation_${compareKey}_error`];
  }, [data]);

  const evaluationMaskTargets = useMemo(() => {
    return evaluation?.mask_targets || {};
  }, [evaluation]);

  const compareEvaluationMaskTargets = useMemo(() => {
    return compareEvaluation?.mask_targets || {};
  }, [compareEvaluation]);

  const confusionMatrix = useMemo(() => {
    return getMatrix(
      evaluation?.confusion_matrices,
      confusionMatrixConfig,
      evaluationMaskTargets
    );
  }, [evaluation, confusionMatrixConfig, evaluationMaskTargets]);

  const compareConfusionMatrix = useMemo(() => {
    return getMatrix(
      compareEvaluation?.confusion_matrices,
      confusionMatrixConfig,
      evaluationMaskTargets,
      compareEvaluationMaskTargets
    );
  }, [
    compareEvaluation,
    confusionMatrixConfig,
    evaluationMaskTargets,
    compareEvaluationMaskTargets,
  ]);

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

  const evaluationNotes = useMemo(() => {
    return notes[id];
  }, [notes, id]);

  const { can_edit_note, can_edit_status } = data?.permissions || {};

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

  const triggerEvent = useTriggerEvent();
  const activeFilter = useActiveFilter(evaluation, compareEvaluation);
  const setEditingField = useSetRecoilState(editingFieldAtom);

  const closeNoteDialog = () => {
    setEditNoteState((note) => ({ ...note, open: false }));
  };

  const closeClassPerformanceConfigDialog = () => {
    setClassPerformanceDialogConfig((state) => ({ ...state, open: false }));
  };

  const closeConfusionMatrixConfigDialog = () => {
    setConfusionMatrixDialogConfig((state) => ({ ...state, open: false }));
  };

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
            <EvaluationIcon
              type={evaluation.info.config.type}
              method={evaluation.info.config.method}
            />
            <EditableLabel
              label={name}
              onSave={(newLabel) => {
                onRename(name, newLabel);
              }}
              onCancel={() => {}}
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
                renderValue={(selected) => {
                  if (!selected) {
                    return (
                      <Typography sx={{ color: "text.secondary" }}>
                        Select a comparison
                      </Typography>
                    );
                  }
                  return selected;
                }}
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
          <ActionMenu evaluationName={evaluation.info.key} />
        </Stack>
      </Stack>

      {/* Tab navigation */}
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
          <Tab label="Execution Info" value="execution" />
        </Tabs>
      </Box>

      {/* Tab content */}
      {activeTab === "overview" && (
        <Overview
          expanded={expanded}
          setExpanded={setExpanded}
          evaluationNotes={evaluationNotes}
          can_edit_note={can_edit_note}
          setEditNoteState={setEditNoteState}
          evaluation={evaluation}
          compareKey={compareKey}
          name={name}
          compareEvaluation={compareEvaluation}
          activeFilter={activeFilter}
          loadView={loadView}
          setNoteEvent={setNoteEvent}
          triggerEvent={triggerEvent}
          closeNoteDialog={closeNoteDialog}
          editNoteState={editNoteState}
          KEY_COLOR={KEY_COLOR}
          COMPARE_KEY_COLOR={COMPARE_KEY_COLOR}
        />
      )}

      {activeTab === "scenario" && (
        <ScenarioAnalysis onCreateScenario={() => loadScenario()} />
      )}

      {activeTab === "execution" && (
        <ExecutionInfo
          evaluation={evaluation}
          compareKey={compareKey}
          compareEvaluation={compareEvaluation}
          name={name}
        />
      )}

      <Dialog
        open={Boolean(classPerformanceDialogConfig.open)}
        fullWidth
        onClose={closeClassPerformanceConfigDialog}
        PaperProps={{
          sx: { background: (theme) => theme.palette.background.paper },
        }}
      >
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1}>
            <Settings />
            <Typography>Display Options: Performance Per Class</Typography>
          </Stack>
          <Stack spacing={1} pt={1}>
            <Typography color="secondary">Sort by:</Typography>
            <Select
              size="small"
              onChange={(e) => {
                setClassPerformanceDialogConfig((state) => ({
                  ...state,
                  sortBy: e.target.value as string,
                }));
              }}
              defaultValue={classPerformanceDialogConfig.sortBy}
            >
              {CLASS_PERFORMANCE_SORT_OPTIONS.map((option) => {
                return (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                );
              })}
            </Select>
          </Stack>
          <Stack spacing={1} pt={1}>
            <Typography color="secondary">Limit bars:</Typography>
            <TextField
              defaultValue={classPerformanceDialogConfig.limit}
              size="small"
              type="number"
              onChange={(e) => {
                const newLimit = parseInt(e.target.value);
                setClassPerformanceDialogConfig((state) => {
                  return {
                    ...state,
                    limit: isNaN(newLimit) ? undefined : newLimit,
                  };
                });
              }}
            />
          </Stack>
          <Stack direction="row" spacing={1} pt={2}>
            <Button
              variant="outlined"
              color="secondary"
              sx={{ width: "100%" }}
              onClick={closeClassPerformanceConfigDialog}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              sx={{ width: "100%" }}
              onClick={() => {
                setClassPerformanceConfig(classPerformanceDialogConfig);
                closeClassPerformanceConfigDialog();
              }}
            >
              Save
            </Button>
          </Stack>
        </Stack>
      </Dialog>
      <Dialog
        open={Boolean(confusionMatrixDialogConfig.open)}
        fullWidth
        onClose={closeConfusionMatrixConfigDialog}
        PaperProps={{
          sx: { background: (theme) => theme.palette.background.paper },
        }}
      >
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1}>
            <Settings />
            <Typography>Display Options: Confusion Matrix</Typography>
          </Stack>
          <Stack spacing={1} pt={1}>
            <Typography color="secondary">Sort by:</Typography>
            <Select
              size="small"
              onChange={(e) => {
                setConfusionMatrixDialogConfig((state) => ({
                  ...state,
                  sortBy: e.target.value as string,
                }));
              }}
              defaultValue={confusionMatrixDialogConfig.sortBy}
            >
              {CONFUSION_MATRIX_SORT_OPTIONS.map((option) => {
                return (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                );
              })}
            </Select>
          </Stack>
          <Stack spacing={1} pt={1}>
            <Typography color="secondary">Limit classes:</Typography>
            <TextField
              defaultValue={confusionMatrixConfig.limit}
              size="small"
              type="number"
              onChange={(e) => {
                const newLimit = parseInt(e.target.value);
                setConfusionMatrixDialogConfig((state) => {
                  return {
                    ...state,
                    limit: isNaN(newLimit) ? undefined : newLimit,
                  };
                });
              }}
            />
          </Stack>
          <FormControlLabel
            label="Use logarithmic colorscale"
            control={
              <Checkbox
                defaultChecked={confusionMatrixConfig.log}
                onChange={(e, checked) => {
                  setConfusionMatrixDialogConfig((state) => ({
                    ...state,
                    log: checked,
                  }));
                }}
              />
            }
          />
          <Stack direction="row" spacing={1} pt={2}>
            <Button
              variant="outlined"
              color="secondary"
              sx={{ width: "100%" }}
              onClick={closeConfusionMatrixConfigDialog}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              sx={{ width: "100%" }}
              onClick={() => {
                setConfusionMatrixConfig(confusionMatrixDialogConfig);
                closeConfusionMatrixConfigDialog();
              }}
            >
              Save
            </Button>
          </Stack>
        </Stack>
      </Dialog>
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

const CLASS_PERFORMANCE_SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "az", label: "Alphabetical (A-Z)" },
  { value: "za", label: "Alphabetical (Z-A)" },
  { value: "best", label: "Best performing" },
  { value: "worst", label: "Worst performing" },
];

const CONFUSION_MATRIX_SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "az", label: "Alphabetical (A-Z)" },
  { value: "za", label: "Alphabetical (Z-A)" },
  { value: "mc", label: "Most common classes" },
  { value: "lc", label: "Least common classes" },
];

type PLOT_CONFIG_TYPE = {
  sortBy?: string;
  limit?: number;
  log?: boolean;
};

type PLOT_CONFIG_DIALOG_TYPE = PLOT_CONFIG_TYPE & {
  open?: boolean;
};

const EvaluationTable = styled(Table)(({ theme }) => ({
  ".MuiTableCell-root": {
    border: `1px solid ${theme.palette.divider}`,
  },
}));
EvaluationTable.defaultProps = {
  size: "small",
};

const CLASS_LABELS = {
  "f1-score": "F1-Score",
  precision: "Precision",
  recall: "Recall",
  confidence: "Confidence",
  iou: "IoU",
};
const CLASSES = Object.keys(CLASS_LABELS);
const EXCLUDED_CLASSES = ["macro avg", "micro avg", "weighted avg"];

function formatPerClassPerformance(perClassPerformance, barConfig) {
  const { limit, sortBy } = barConfig;
  if (!sortBy && !limit) return perClassPerformance;

  let computedPerClassPerformance = perClassPerformance;
  if (sortBy && sortBy !== DEFAULT_BAR_CONFIG.sortBy) {
    computedPerClassPerformance = perClassPerformance.sort((a, b) => {
      if (sortBy === "best") {
        return b.value - a.value;
      } else if (sortBy === "worst") {
        return a.value - b.value;
      } else if (sortBy === "az") {
        return a.property.localeCompare(b.property);
      }
      return b.property.localeCompare(a.property);
    });
  }

  if (typeof limit === "number") {
    return computedPerClassPerformance.slice(0, limit);
  }
  return computedPerClassPerformance;
}

function getMatrix(matrices, config, maskTargets, compareMaskTargets?) {
  if (!matrices) return;
  const { sortBy = "az", limit } = config;
  const parsedLimit = typeof limit === "number" ? limit : undefined;
  const originalClasses = matrices[`${sortBy}_classes`];
  const originalMatrix = matrices[`${sortBy}_matrix`];
  const classes = originalClasses.slice(0, parsedLimit);
  const matrix = originalMatrix.slice(0, parsedLimit);
  const colorscale = matrices[`${sortBy}_colorscale`];
  const labels = classes.map((c) => {
    return compareMaskTargets?.[c] || maskTargets?.[c] || c;
  });
  const noneIndex = originalClasses.indexOf(NONE_CLASS);
  if (parsedLimit < originalClasses.length && noneIndex > -1) {
    labels.push(
      compareMaskTargets?.[NONE_CLASS] ||
        maskTargets?.[NONE_CLASS] ||
        NONE_CLASS
    );
    matrix.push(originalMatrix[noneIndex]);
  }
  return { labels, matrix, colorscale };
}

function getConfigLabel({ config, type, dashed }) {
  const { sortBy } = config;
  if (!sortBy || sortBy === DEFAULT_BAR_CONFIG.sortBy) return "";
  const sortByLabels =
    type === "classPerformance"
      ? CLASS_PERFORMANCE_SORT_OPTIONS
      : CONFUSION_MATRIX_SORT_OPTIONS;
  const sortByLabel = sortByLabels.find(
    (option) => option.value === sortBy
  )?.label;
  return dashed ? ` - ${sortByLabel}` : sortByLabel;
}

function useActiveFilter(evaluation, compareEvaluation) {
  const evalKey = evaluation?.info?.key;
  const compareKey = compareEvaluation?.info?.key;
  const [stages] = useRecoilState(view);
  if (stages?.length >= 1) {
    const stage = stages[0];
    const { _cls, kwargs } = stage;
    if (_cls.endsWith("FilterLabels")) {
      const [_, filter] = kwargs;
      const filterEq = filter[1].$eq || [];
      const [filterEqLeft, filterEqRight] = filterEq;
      if (filterEqLeft === "$$this.label") {
        return { type: "label", value: filterEqRight };
      } else if (filterEqLeft === `$$this.${evalKey}`) {
        return {
          type: "metric",
          value: filterEqRight,
          isCompare: false,
        };
      } else if (filterEqLeft === `$$this.${compareKey}`) {
        return {
          type: "metric",
          value: filterEqRight,
          isCompare: true,
        };
      }
    }
  }
}
