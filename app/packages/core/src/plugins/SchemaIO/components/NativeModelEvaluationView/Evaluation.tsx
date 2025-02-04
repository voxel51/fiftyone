import _ from "lodash";
import { Dialog } from "@fiftyone/components";
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
  Typography,
  useTheme,
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import Error from "./Error";
import EvaluationNotes from "./EvaluationNotes";
import EvaluationPlot from "./EvaluationPlot";
import Status from "./Status";
import { formatValue, getNumericDifference, useTriggerEvent } from "./utils";

const KEY_COLOR = "#ff6d04";
const COMPARE_KEY_COLOR = "#03a9f4";
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
  } = props;
  const theme = useTheme();
  const [expanded, setExpanded] = React.useState("summary");
  const [mode, setMode] = useState("chart");
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
  const compareEvaluationError = useMemo(() => {
    const evaluation = data?.[`evaluation_${compareKey}_error`];
    return evaluation;
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
    const keys: string[] = [];
    const evaluations = data?.evaluations || [];
    for (const evaluation of evaluations) {
      const { key } = evaluation;
      if (key !== name) {
        keys.push(key);
      }
    }
    return keys;
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

  const evaluationInfo = evaluation.info;
  const evaluationKey = evaluationInfo.key;
  const evaluationTimestamp = evaluationInfo.timestamp;
  const evaluationConfig = evaluationInfo.config;
  const evaluationMetrics = evaluation.metrics;
  const evaluationType = evaluationConfig.type;
  const evaluationMethod = evaluationConfig.method;
  const compareEvaluationInfo = compareEvaluation?.info || {};
  const compareEvaluationKey = compareEvaluationInfo?.key;
  const compareEvaluationTimestamp = compareEvaluationInfo?.timestamp;
  const compareEvaluationConfig = compareEvaluationInfo?.config || {};
  const compareEvaluationMetrics = compareEvaluation?.metrics || {};
  const compareEvaluationType = compareEvaluationConfig.type;
  const isObjectDetection = evaluationType === "detection";
  const isClassification = evaluationType === "classification";
  const isSegmentation = evaluationType === "segmentation";
  const isBinaryClassification =
    evaluationType === "classification" && evaluationMethod === "binary";
  const showTpFpFn = isObjectDetection || isBinaryClassification;
  const isNoneBinaryClassification =
    isClassification && evaluationMethod !== "binary";
  const infoRows = [
    {
      id: "evaluation_key",
      property: "Evaluation Key",
      value: evaluationKey,
      compareValue: compareEvaluationKey,
    },
    {
      id: "type",
      property: "Type",
      value: evaluationType,
      compareValue: compareEvaluationType,
    },
    {
      id: "method",
      property: "Method",
      value: evaluationConfig.method,
      compareValue: compareEvaluationConfig.method,
    },
    {
      id: "cls",
      property: "Classes",
      value: evaluationConfig.cls,
      compareValue: compareEvaluationConfig.cls,
    },
    {
      id: "pf",
      property: "Prediction Field",
      value: evaluationConfig.pred_field,
      compareValue: compareEvaluationConfig.pred_field,
    },
    {
      id: "gtf",
      property: "Ground Truth Field",
      value: evaluationConfig.gt_field,
      compareValue: compareEvaluationConfig.gt_field,
    },
    {
      id: "map",
      property: "mAP Computed",
      value: Boolean(evaluationConfig.compute_mAP).toString(),
      compareValue: Boolean(compareEvaluationConfig.compute_mAP).toString(),
    },
    {
      id: "iou",
      property: "IoU Threshold",
      value: evaluationConfig.iou,
      compareValue: compareEvaluationConfig.iou,
      hide: !isObjectDetection,
    },
    {
      id: "classwise",
      property: "Classwise",
      value: Boolean(evaluationConfig.classwise).toString(),
      compareValue: Boolean(compareEvaluationConfig.classwise).toString(),
    },
    {
      id: "iscrowd",
      property: "IsCrowd",
      value: Boolean(evaluationConfig.iscrowd).toString(),
      compareValue: Boolean(compareEvaluationConfig.iscrowd).toString(),
    },
    {
      id: "use_masks",
      property: "Use Masks",
      value: Boolean(evaluationConfig.use_masks).toString(),
      compareValue: Boolean(compareEvaluationConfig.use_masks).toString(),
    },
    {
      id: "use_boxes",
      property: "Use Boxes",
      value: Boolean(evaluationConfig.use_boxes).toString(),
      compareValue: Boolean(compareEvaluationConfig.use_boxes).toString(),
    },
    {
      id: "tolerance",
      property: "Tolerance",
      value: evaluationConfig.tolerance,
      compareValue: compareEvaluationConfig.tolerance,
    },
    {
      id: "iou_threshs",
      property: "IoU Thresholds",
      value: Array.isArray(evaluationConfig.iou_threshs)
        ? evaluationConfig.iou_threshs.join(", ")
        : "",
      compareValue: Array.isArray(compareEvaluationConfig.iou_threshs)
        ? compareEvaluationConfig.iou_threshs.join(", ")
        : "",
      hide: !isObjectDetection,
    },
    {
      id: "max_preds",
      property: "Max Predictions",
      value: evaluationConfig.max_preds,
      compareValue: compareEvaluationConfig.max_preds,
    },
    {
      id: "error_level",
      property: "Error Level",
      value: evaluationConfig.error_level,
      compareValue: compareEvaluationConfig.error_level,
    },
    {
      id: "timestamp",
      property: "Creation Time",
      value: evaluationTimestamp?.$date || evaluationTimestamp,
      compareValue:
        compareEvaluationTimestamp?.$date || compareEvaluationTimestamp,
    },
    {
      id: "version",
      property: "Version",
      value: evaluationInfo.version,
      compareValue: compareEvaluationInfo.version,
    },
  ];
  const metricPerformance = [
    {
      id: "average_confidence",
      property: "Average Confidence",
      value: evaluationMetrics.average_confidence,
      compareValue: compareEvaluationMetrics.average_confidence,
      hide: isSegmentation,
    },
    {
      id: "iou",
      property: "IoU Threshold",
      value: evaluationConfig.iou,
      compareValue: compareEvaluationConfig.iou,
      hide: !isObjectDetection,
    },
    {
      id: "precision",
      property: "Precision",
      value: evaluationMetrics.precision,
      compareValue: compareEvaluationMetrics.precision,
    },
    {
      id: "recall",
      property: "Recall",
      value: evaluationMetrics.recall,
      compareValue: compareEvaluationMetrics.recall,
    },
    {
      id: "fscore",
      property: "F1-Score",
      value: evaluationMetrics.fscore,
      compareValue: compareEvaluationMetrics.fscore,
    },
  ];
  const computedMetricPerformance = metricPerformance.filter((m) => !m.hide);
  const summaryRows = [
    {
      id: "average_confidence",
      property: "Average Confidence",
      value: evaluationMetrics.average_confidence,
      compareValue: compareEvaluationMetrics.average_confidence,
      hide: isSegmentation,
    },
    {
      id: "support",
      property: "Support",
      value: evaluationMetrics.support,
      compareValue: compareEvaluationMetrics.support,
    },
    {
      id: "accuracy",
      property: "Accuracy",
      value: evaluationMetrics.accuracy,
      compareValue: compareEvaluationMetrics.accuracy,
    },
    {
      id: "iou",
      property: "IoU Threshold",
      value: evaluationConfig.iou,
      compareValue: compareEvaluationConfig.iou,
      hide: !isObjectDetection,
    },
    {
      id: "precision",
      property: "Precision",
      value: evaluationMetrics.precision,
      compareValue: compareEvaluationMetrics.precision,
    },
    {
      id: "recall",
      property: "Recall",
      value: evaluationMetrics.recall,
      compareValue: compareEvaluationMetrics.recall,
    },
    {
      id: "fscore",
      property: "F1-Score",
      value: evaluationMetrics.fscore,
      compareValue: compareEvaluationMetrics.fscore,
    },
    {
      id: "mAP",
      property: "mAP",
      value: evaluationMetrics.mAP,
      compareValue: compareEvaluationMetrics.mAP,
      hide: !isObjectDetection,
    },
    {
      id: "mAR",
      property: "mAR",
      value: evaluationMetrics.mAR,
      compareValue: compareEvaluationMetrics.mAR,
      hide: !isObjectDetection,
    },
    {
      id: "tp",
      property: "True Positives",
      value: evaluationMetrics.tp,
      compareValue: compareEvaluationMetrics.tp,
      filterable: true,
      active:
        activeFilter?.value === "tp"
          ? activeFilter.isCompare
            ? "compare"
            : "selected"
          : false,
      hide: !showTpFpFn,
    },
    {
      id: "fp",
      property: "False Positives",
      value: evaluationMetrics.fp,
      compareValue: compareEvaluationMetrics.fp,
      lesserIsBetter: true,
      filterable: true,
      active:
        activeFilter?.value === "fp"
          ? activeFilter.isCompare
            ? "compare"
            : "selected"
          : false,
      hide: !showTpFpFn,
    },
    {
      id: "fn",
      property: "False Negatives",
      value: evaluationMetrics.fn,
      compareValue: compareEvaluationMetrics.fn,
      lesserIsBetter: true,
      filterable: true,
      active:
        activeFilter?.value === "fn"
          ? activeFilter.isCompare
            ? "compare"
            : "selected"
          : false,
      hide: !showTpFpFn,
    },
    {
      id: true,
      property: "Correct",
      value: evaluationMetrics.num_correct,
      compareValue: compareEvaluationMetrics.num_correct,
      lesserIsBetter: false,
      filterable: true,
      hide: !isNoneBinaryClassification,
    },
    {
      id: false,
      property: "Incorrect",
      value: evaluationMetrics.num_incorrect,
      compareValue: compareEvaluationMetrics.num_incorrect,
      lesserIsBetter: false,
      filterable: true,
      hide: !isNoneBinaryClassification,
    },
    ...formatCustomMetricRows(evaluation, compareEvaluation),
  ];

  const perClassPerformance = {};
  for (const key in evaluation?.per_class_metrics) {
    if (EXCLUDED_CLASSES.includes(key)) continue;
    const metrics = evaluation?.per_class_metrics[key];
    const compareMetrics = compareEvaluation?.per_class_metrics[key] || {};
    for (const metric in metrics) {
      if (!CLASSES.includes(metric)) continue;
      if (!perClassPerformance[metric]) {
        perClassPerformance[metric] = [];
      }
      const maskTarget = evaluationMaskTargets?.[key];
      const compareMaskTarget = compareEvaluationMaskTargets?.[key];
      perClassPerformance[metric].push({
        id: key,
        property: maskTarget || key,
        compareProperty: compareMaskTarget || maskTarget || key,
        value: metrics[metric],
        compareValue: compareMetrics[metric],
      });
    }
  }
  const performanceClasses = Object.keys(perClassPerformance);
  const classPerformance = formatPerClassPerformance(
    perClassPerformance[performanceClass],
    classPerformanceConfig
  );
  const selectedPoints =
    activeFilter?.type === "label"
      ? [classPerformance.findIndex((c) => c.id === activeFilter.value)]
      : undefined;

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <IconButton
            onClick={() => {
              navigateBack();
            }}
            sx={{ pl: 0 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography>{name}</Typography>
        </Stack>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Status
            setStatusEvent={setStatusEvent}
            status={status}
            canEdit={can_edit_status}
          />
          <ToggleButtonGroup
            exclusive
            value={mode}
            onChange={(e, mode) => {
              if (mode) setMode(mode);
            }}
            sx={{ height: "28px" }}
          >
            <ToggleButton value="chart">
              <InsertChart />
            </ToggleButton>
            <ToggleButton value="info" title="Switch to ">
              <Info />
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ pb: 1 }}>
        <Stack sx={{ width: "50%" }} spacing={0.5}>
          <Typography color="secondary">Prediction set</Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              background: theme.palette.background.card,
              p: "3px",
              borderRadius: 0.5,
              pl: 1.5,
              border: "1px solid",
              borderColor: theme.palette.divider,
            }}
          >
            <ColorSquare color={KEY_COLOR} />
            <Typography>{evaluationKey}</Typography>
          </Stack>
        </Stack>
        <Stack sx={{ width: "50%" }} spacing={0.5}>
          <Stack direction="row" spacing={1}>
            <Typography color="secondary">Compare against</Typography>
            {compareEvaluationError && (
              <Typography sx={{ color: theme.palette.error.main }}>
                Unsupported model evaluation type
              </Typography>
            )}
          </Stack>
          {compareKeys.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ color: (theme) => theme.palette.text.tertiary }}
            >
              You need at least one more evaluation to compare.
            </Typography>
          ) : (
            <Select
              key={compareKey}
              sx={{
                height: 28,
                width: "100%",
                background: theme.palette.background.card,
              }}
              defaultValue={compareKey}
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
              startAdornment={
                compareKey ? (
                  <Box sx={{ pr: 1 }}>
                    <ColorSquare color={COMPARE_KEY_COLOR} />{" "}
                  </Box>
                ) : null
              }
            >
              {compareKeys.map((key) => {
                return (
                  <MenuItem value={key} key={key}>
                    <Typography>{key}</Typography>
                  </MenuItem>
                );
              })}
            </Select>
          )}
        </Stack>
      </Stack>
      <Card sx={{ p: 2 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography color="secondary">Evaluation notes</Typography>
          <Box
            title={
              can_edit_note
                ? ""
                : "You do not have permission to edit evaluation notes"
            }
            sx={{ cursor: can_edit_note ? "pointer" : "not-allowed" }}
          >
            <IconButton
              size="small"
              color="secondary"
              sx={{ borderRadius: 16 }}
              onClick={() => {
                setEditNoteState((note) => ({ ...note, open: true }));
              }}
              disabled={!can_edit_note}
            >
              <EditNote />
            </IconButton>
          </Box>
        </Stack>
        <EvaluationNotes notes={evaluationNotes} variant="details" />
      </Card>
      {mode === "chart" && (
        <Stack spacing={1}>
          <Accordion
            expanded={expanded === "summary"}
            onChange={(e, expanded) => {
              setExpanded(expanded ? "summary" : "");
            }}
            disableGutters
            sx={{ borderRadius: 1, "&::before": { display: "none" } }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              Summary
            </AccordionSummary>
            <AccordionDetails>
              <EvaluationTable>
                <TableHead>
                  <TableRow
                    sx={{
                      "th p": {
                        color: (theme) => theme.palette.text.secondary,
                        fontSize: "1rem",
                        fontWeight: 600,
                      },
                    }}
                  >
                    <TableCell>
                      <Typography>Metric</Typography>
                    </TableCell>
                    <TableCell>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center" }}
                      >
                        <ColorSquare color={KEY_COLOR} />
                        <Typography>{name}</Typography>
                      </Stack>
                    </TableCell>
                    {compareKey && (
                      <>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center" }}
                          >
                            <ColorSquare color={COMPARE_KEY_COLOR} />
                            <Typography>{compareKey}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography>Difference</Typography>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summaryRows.map((row) => {
                    const {
                      property,
                      value,
                      compareValue,
                      lesserIsBetter,
                      filterable,
                      id: rowId,
                      active,
                      hide,
                    } = row;
                    if (hide) return null;
                    const difference = getNumericDifference(
                      value,
                      compareValue
                    );
                    const ratio = getNumericDifference(
                      value,
                      compareValue,
                      true,
                      1
                    );
                    const positiveRatio = ratio > 0;
                    const zeroRatio = ratio === 0;
                    const negativeRatio = ratio < 0;
                    const ratioColor = positiveRatio
                      ? "#8BC18D"
                      : negativeRatio
                      ? "#FF6464"
                      : theme.palette.text.tertiary;
                    const showTrophy = lesserIsBetter
                      ? difference < 0
                      : difference > 0;
                    const activeStyle: SxProps = {
                      backgroundColor: theme.palette.voxel["500"],
                      color: "#FFFFFF",
                    };

                    return (
                      <TableRow key={rowId}>
                        <TableCell component="th" scope="row">
                          {property}
                        </TableCell>
                        <TableCell>
                          <Stack
                            direction="row"
                            sx={{
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Typography>
                              {value ? (
                                formatValue(value)
                              ) : (
                                <Typography color="text.tertiary">—</Typography>
                              )}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                              {showTrophy && (
                                <Typography sx={{ fontSize: 12 }}>
                                  🏆
                                </Typography>
                              )}
                              {filterable && (
                                <IconButton
                                  sx={{
                                    p: 0.25,
                                    borderRadius: 0.5,
                                    ...(active === "selected"
                                      ? activeStyle
                                      : {}),
                                  }}
                                  onClick={() => {
                                    loadView("field", { field: rowId });
                                  }}
                                  title="Load view"
                                >
                                  <GridView sx={{ fontSize: 14 }} />
                                </IconButton>
                              )}
                            </Stack>
                          </Stack>
                        </TableCell>
                        {compareKey && (
                          <>
                            <TableCell>
                              <Stack
                                direction="row"
                                spacing={1}
                                sx={{ justifyContent: "space-between" }}
                              >
                                <Typography>
                                  {compareValue ? (
                                    formatValue(compareValue)
                                  ) : (
                                    <Typography color="text.tertiary">
                                      —
                                    </Typography>
                                  )}
                                </Typography>

                                {filterable && (
                                  <IconButton
                                    sx={{
                                      p: 0.25,
                                      borderRadius: 0.5,
                                      ...(active === "compare"
                                        ? activeStyle
                                        : {}),
                                    }}
                                    onClick={() => {
                                      loadView("field", {
                                        field: rowId,
                                        key: compareKey,
                                      });
                                    }}
                                    title="Load view"
                                  >
                                    <GridView sx={{ fontSize: 16 }} />
                                  </IconButton>
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                sx={{ justifyContent: "space-between" }}
                              >
                                <Typography>{difference}</Typography>
                                {!isNaN(ratio) && (
                                  <Stack
                                    direction="row"
                                    sx={{ alignItems: "center" }}
                                  >
                                    {positiveRatio && (
                                      <ArrowDropUp sx={{ color: ratioColor }} />
                                    )}
                                    {negativeRatio && (
                                      <ArrowDropDown
                                        sx={{ color: ratioColor }}
                                      />
                                    )}
                                    {zeroRatio && (
                                      <Typography
                                        pr={1}
                                        sx={{ color: ratioColor }}
                                      >
                                        —
                                      </Typography>
                                    )}
                                    <Typography
                                      sx={{
                                        fontSize: "12px",
                                        color: ratioColor,
                                      }}
                                    >
                                      {ratio}%
                                    </Typography>
                                  </Stack>
                                )}
                              </Stack>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </EvaluationTable>
            </AccordionDetails>
          </Accordion>
          <Accordion
            expanded={expanded === "metric"}
            onChange={(e, expanded) => {
              setExpanded(expanded ? "metric" : "");
            }}
            disableGutters
            sx={{ borderRadius: 1, "&::before": { display: "none" } }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              Metric Performance
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                <Stack alignItems="flex-end">
                  <ToggleButtonGroup
                    exclusive
                    value={metricMode}
                    onChange={(e, mode) => {
                      if (mode) setMetricMode(mode);
                    }}
                    sx={{ height: "28px" }}
                  >
                    <ToggleButton value="chart">
                      <InsertChart />
                    </ToggleButton>
                    <ToggleButton value="table">
                      <TableRows />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                {metricMode === "chart" && (
                  <EvaluationPlot
                    data={[
                      {
                        histfunc: "sum",
                        y: computedMetricPerformance.map((m) => m.value),
                        x: computedMetricPerformance.map((m) => m.property),
                        type: "histogram",
                        name: name,
                        marker: {
                          color: KEY_COLOR,
                        },
                      },
                      {
                        histfunc: "sum",
                        y: computedMetricPerformance.map((m) => m.compareValue),
                        x: computedMetricPerformance.map((m) => m.property),
                        type: "histogram",
                        name: compareKey,
                        marker: {
                          color: COMPARE_KEY_COLOR,
                        },
                      },
                    ]}
                  />
                )}
                {metricMode === "table" && (
                  <EvaluationTable>
                    <TableHead>
                      <TableRow
                        sx={{
                          "th p": {
                            color: (theme) => theme.palette.text.secondary,
                            fontSize: "1rem",
                            fontWeight: 600,
                          },
                        }}
                      >
                        <TableCell>
                          <Typography>Metric</Typography>
                        </TableCell>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center" }}
                          >
                            <ColorSquare color={KEY_COLOR} />
                            <Typography>{name}</Typography>
                          </Stack>
                        </TableCell>
                        {compareKey && (
                          <>
                            <TableCell>
                              <Stack
                                direction="row"
                                spacing={1}
                                sx={{ alignItems: "center" }}
                              >
                                <ColorSquare color={COMPARE_KEY_COLOR} />
                                <Typography>{compareKey}</Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Typography>Difference</Typography>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {computedMetricPerformance.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell component="th" scope="row">
                            {row.property}
                          </TableCell>
                          <TableCell>{formatValue(row.value)}</TableCell>
                          {compareKey && (
                            <>
                              <TableCell>
                                {formatValue(row.compareValue)}
                              </TableCell>
                              <TableCell>
                                {getNumericDifference(
                                  row.value,
                                  row.compareValue
                                )}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </EvaluationTable>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
          <Accordion
            expanded={expanded === "class"}
            onChange={(e, expanded) => {
              setExpanded(expanded ? "class" : "");
            }}
            disableGutters
            sx={{ borderRadius: 1, "&::before": { display: "none" } }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              Class Performance
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                  <Typography color="secondary">
                    {CLASS_LABELS[performanceClass]} Per Class
                    {getConfigLabel({
                      config: classPerformanceConfig,
                      type: "classPerformance",
                      dashed: true,
                    })}
                  </Typography>
                  <Stack
                    alignItems="flex-end"
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    <ToggleButtonGroup
                      exclusive
                      value={classMode}
                      onChange={(e, mode) => {
                        if (mode) setClassMode(mode);
                      }}
                      sx={{ height: "28px" }}
                    >
                      <ToggleButton value="chart">
                        <InsertChart />
                      </ToggleButton>
                      <ToggleButton value="table">
                        <TableRows />
                      </ToggleButton>
                    </ToggleButtonGroup>
                    <Select
                      value={performanceClass}
                      size="small"
                      sx={{ height: 28 }}
                      onChange={(e) => {
                        setPerformanceClass(e.target.value as string);
                      }}
                    >
                      {performanceClasses.map((cls) => {
                        return (
                          <MenuItem key={cls} value={cls}>
                            {CLASS_LABELS[cls]}
                          </MenuItem>
                        );
                      })}
                    </Select>
                    <IconButton
                      onClick={() => {
                        setClassPerformanceDialogConfig((state) => ({
                          ...state,
                          open: true,
                        }));
                      }}
                    >
                      <Settings />
                    </IconButton>
                  </Stack>
                </Stack>
                {classMode === "chart" && (
                  <EvaluationPlot
                    data={[
                      {
                        histfunc: "sum",
                        y: classPerformance.map((metrics) => metrics.value),
                        x: classPerformance.map((metrics) => metrics.property),
                        type: "histogram",
                        name: `${CLASS_LABELS[performanceClass]} per class`,
                        marker: {
                          color: KEY_COLOR,
                        },
                        key: name,
                        selectedpoints: selectedPoints,
                      },
                      {
                        histfunc: "sum",
                        y: classPerformance.map(
                          (metrics) => metrics.compareValue
                        ),
                        x: classPerformance.map(
                          (metrics) =>
                            metrics.compareProperty || metrics.property
                        ),
                        type: "histogram",
                        name: `${CLASS_LABELS[performanceClass]} per class`,
                        marker: {
                          color: COMPARE_KEY_COLOR,
                        },
                        key: compareKey,
                        selectedpoints: selectedPoints,
                      },
                    ]}
                    onClick={({ points }) => {
                      if (selectedPoints?.[0] === points[0]?.pointIndices[0]) {
                        return loadView("clear", {});
                      }
                      loadView("class", { x: points[0]?.x });
                    }}
                  />
                )}
                {classMode === "table" && (
                  <EvaluationTable>
                    <TableHead>
                      <TableRow
                        sx={{
                          "th p": {
                            color: (theme) => theme.palette.text.secondary,
                            fontSize: "1rem",
                            fontWeight: 600,
                          },
                        }}
                      >
                        <TableCell>
                          <Typography>Metric</Typography>
                        </TableCell>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center" }}
                          >
                            <ColorSquare color={KEY_COLOR} />
                            <Typography>{name}</Typography>
                          </Stack>
                        </TableCell>
                        {compareKey && (
                          <>
                            <TableCell>
                              <Stack
                                direction="row"
                                spacing={1}
                                sx={{ alignItems: "center" }}
                              >
                                <ColorSquare color={COMPARE_KEY_COLOR} />
                                <Typography>{compareKey}</Typography>
                              </Stack>
                            </TableCell>{" "}
                            <TableCell>
                              <Typography>Difference</Typography>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {classPerformance.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell component="th" scope="row">
                            {row.property}
                          </TableCell>
                          <TableCell>{formatValue(row.value)}</TableCell>
                          {compareKey && (
                            <>
                              <TableCell>
                                {formatValue(row.compareValue)}
                              </TableCell>
                              <TableCell>
                                {getNumericDifference(
                                  row.value,
                                  row.compareValue
                                )}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </EvaluationTable>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
          <Accordion
            expanded={expanded === "matrices"}
            onChange={(e, expanded) => {
              setExpanded(expanded ? "matrices" : "");
            }}
            disableGutters
            sx={{ borderRadius: 1, "&::before": { display: "none" } }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              Confusion Matrices
            </AccordionSummary>
            <AccordionDetails>
              <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                <Typography color="secondary">
                  {getConfigLabel({ config: confusionMatrixConfig })}
                </Typography>
                <Box>
                  <IconButton
                    onClick={() => {
                      setConfusionMatrixDialogConfig((state) => ({
                        ...state,
                        open: true,
                      }));
                    }}
                  >
                    <Settings />
                  </IconButton>
                </Box>
              </Stack>
              <Stack direction={"row"} key={compareKey}>
                <Stack sx={{ width: "100%" }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", justifyContent: "center" }}
                  >
                    <ColorSquare color={KEY_COLOR} />
                    <Typography>{name}</Typography>
                  </Stack>
                  <EvaluationPlot
                    data={[
                      {
                        z: confusionMatrix?.matrix,
                        x: confusionMatrix?.labels,
                        y: confusionMatrix?.labels,
                        type: "heatmap",
                        colorscale: confusionMatrixConfig.log
                          ? confusionMatrix?.colorscale || "viridis"
                          : "viridis",
                        hovertemplate:
                          [
                            "<b>count: %{z:d}</b>",
                            `${
                              evaluation?.info?.config?.gt_field || "truth"
                            }: %{y}`,
                            `${
                              evaluation?.info?.config?.pred_field ||
                              "predicted"
                            }: %{x}`,
                          ].join(" <br>") + "<extra></extra>",
                      },
                    ]}
                    onClick={({ points }) => {
                      const firstPoint = points[0];
                      loadView("matrix", { x: firstPoint.x, y: firstPoint.y });
                    }}
                    layout={{
                      yaxis: {
                        autorange: "reversed",
                        type: "category",
                      },
                      xaxis: {
                        type: "category",
                      },
                    }}
                  />
                </Stack>
                {compareKey && (
                  <Stack sx={{ width: "100%" }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", justifyContent: "center" }}
                    >
                      <ColorSquare color={COMPARE_KEY_COLOR} />
                      <Typography>{compareKey}</Typography>
                    </Stack>
                    <EvaluationPlot
                      data={[
                        {
                          z: compareConfusionMatrix?.matrix,
                          x: compareConfusionMatrix?.labels,
                          y: compareConfusionMatrix?.labels,
                          type: "heatmap",
                          colorscale: confusionMatrixConfig.log
                            ? compareConfusionMatrix?.colorscale || "viridis"
                            : "viridis",
                          hovertemplate:
                            [
                              "<b>count: %{z:d}</b>",
                              `${
                                evaluation?.info?.config?.gt_field || "truth"
                              }: %{y}`,
                              `${
                                evaluation?.info?.config?.pred_field ||
                                "predicted"
                              }: %{x}`,
                            ].join(" <br>") + "<extra></extra>",
                        },
                      ]}
                      onClick={({ points }) => {
                        const firstPoint = points[0];
                        loadView("matrix", {
                          x: firstPoint.x,
                          y: firstPoint.y,
                          key: compareKey,
                        });
                      }}
                      layout={{
                        yaxis: {
                          autorange: "reversed",
                          type: "category",
                        },
                        xaxis: {
                          type: "category",
                        },
                      }}
                    />
                  </Stack>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}
      {mode === "info" && (
        <Card sx={{ p: 2 }}>
          <EvaluationTable>
            <TableHead>
              <TableRow
                sx={{
                  "th p": {
                    color: (theme) => theme.palette.text.secondary,
                    fontSize: "1rem",
                    fontWeight: 600,
                  },
                }}
              >
                <TableCell>
                  <Typography>Property</Typography>
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 16 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    <ColorSquare color={KEY_COLOR} />
                    <Typography>{name}</Typography>
                  </Stack>
                </TableCell>
                {compareKey && (
                  <TableCell>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center" }}
                    >
                      <ColorSquare color={COMPARE_KEY_COLOR} />
                      <Typography>{compareKey}</Typography>
                    </Stack>
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {infoRows.map((row) =>
                row.hide ? null : (
                  <TableRow key={row.id}>
                    <TableCell component="th" scope="row">
                      {row.property}
                    </TableCell>
                    <TableCell>{formatValue(row.value)}</TableCell>
                    {compareKey && (
                      <TableCell>{formatValue(row.compareValue)}</TableCell>
                    )}
                  </TableRow>
                )
              )}
            </TableBody>
          </EvaluationTable>
        </Card>
      )}
      <Dialog
        open={editNoteState.open}
        fullWidth
        onClose={closeNoteDialog}
        PaperProps={{
          sx: { background: (theme) => theme.palette.background.level2 },
        }}
      >
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <EditNote sx={{ fontSize: 16 }} color="secondary" />
            <Typography sx={{ fontSize: 16 }} color="secondary">
              {evaluationNotes ? "Edit" : "Add"} evaluation notes
            </Typography>
          </Stack>
          <TextField
            onFocus={() => {
              setEditingField(true);
            }}
            onBlur={() => {
              setEditingField(false);
            }}
            multiline
            rows={10}
            defaultValue={evaluationNotes}
            placeholder="Note (markdown) for the evaluation..."
            onChange={(e) => {
              setEditNoteState((note) => ({ ...note, note: e.target.value }));
            }}
          />
          <Stack direction={"row"} spacing={1}>
            <Button
              variant="outlined"
              color="secondary"
              sx={{ width: "50%" }}
              onClick={closeNoteDialog}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              sx={{ width: "50%" }}
              onClick={() => {
                triggerEvent(setNoteEvent, { note: editNoteState.note });
                closeNoteDialog();
              }}
            >
              Save
            </Button>
          </Stack>
        </Stack>
      </Dialog>
      <Dialog
        open={Boolean(classPerformanceDialogConfig.open)}
        fullWidth
        onClose={closeClassPerformanceConfigDialog}
        PaperProps={{
          sx: { background: (theme) => theme.palette.background.level2 },
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
          sx: { background: (theme) => theme.palette.background.level2 },
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
  onChangeCompareKey: (compareKey: string) => void;
  compareKey?: string;
  data: any;
  setStatusEvent: string;
  statuses: Record<string, string>;
  setNoteEvent: string;
  notes: Record<string, string>;
  loadView: (type: string, params: any) => void;
};

function ColorSquare(props: { color: string }) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        backgroundColor: props.color,
        borderRadius: 2,
      }}
    />
  );
}

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

type CustomMetric = {
  label: string;
  key: any;
  value: any;
  lower_is_better: boolean;
};

type CustomMetrics = {
  [operatorUri: string]: CustomMetric;
};

type SummaryRow = {
  id: string;
  property: string;
  value: any;
  compareValue: any;
  lesserIsBetter: boolean;
  filterable: boolean;
  active: boolean;
  hide: boolean;
};

function formatCustomMetricRows(evaluationMetrics, comparisonMetrics) {
  const results = [] as SummaryRow[];
  const customMetrics = (_.get(evaluationMetrics, "custom_metrics", null) ||
    {}) as CustomMetrics;
  for (const [operatorUri, customMetric] of Object.entries(customMetrics)) {
    const compareValue = _.get(
      comparisonMetrics,
      `custom_metrics.${operatorUri}.value`,
      null
    );
    const hasOneValue = customMetric.value !== null || compareValue !== null;

    results.push({
      id: operatorUri,
      property: customMetric.label,
      value: customMetric.value,
      compareValue,
      lesserIsBetter: customMetric.lower_is_better,
      filterable: false,
      active: false,
      hide: !hasOneValue,
    });
  }
  return results;
}
