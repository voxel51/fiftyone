import { Dialog } from "@fiftyone/components";
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
  CircularProgress,
  IconButton,
  MenuItem,
  Select,
  Stack,
  styled,
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
import EvaluationNotes from "./EvaluationNotes";
import EvaluationPlot from "./EvaluationPlot";
import Status from "./Status";
import { formatValue, getNumericDifference, useTriggerEvent } from "./utils";

const KEY_COLOR = "#ff6d04";
const COMPARE_KEY_COLOR = "#03a9f4";

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
  const [barConfigState, setBarConfigState] = useState({
    sortBy: "",
    limit: 0,
  });
  const [barConfigDialogState, setBarConfigDialogState] = useState({
    open: false,
    sortBy: "best",
    limit: 20,
  });
  const [metricMode, setMetricMode] = useState("chart");
  const [classMode, setClassMode] = useState("chart");
  const [performanceClass, setPerformanceClass] = useState("precision");
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [viewState, setViewState] = useState({ type: "", view: {} });
  const evaluation = useMemo(() => {
    const evaluation = data?.[`evaluation_${name}`];
    return evaluation;
  }, [data]);
  const compareEvaluation = useMemo(() => {
    const evaluation = data?.[`evaluation_${compareKey}`];
    return evaluation;
  }, [data]);
  const confusionMatrix = useMemo(() => {
    return evaluation?.confusion_matrix;
  }, [evaluation]);
  const compareConfusionMatrix = useMemo(() => {
    return compareEvaluation?.confusion_matrix;
  }, [compareEvaluation]);
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

  const closeNoteDialog = () => {
    setEditNoteState((note) => ({ ...note, open: false }));
  };
  const closeBarConfigDialog = () => {
    setBarConfigDialogState((state) => ({ ...state, open: false }));
  };

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
  const compareEvaluationInfo = compareEvaluation?.info || {};
  const compareEvaluationKey = compareEvaluationInfo?.key;
  const compareEvaluationTimestamp = compareEvaluationInfo?.timestamp;
  const compareEvaluationConfig = compareEvaluationInfo?.config || {};
  const compareEvaluationMetrics = compareEvaluation?.metrics || {};
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
      value: evaluationConfig.type,
      compareValue: compareEvaluationConfig.type,
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
    },
    {
      id: "iou",
      property: "IoU Threshold",
      value: evaluationConfig.iou,
      compareValue: compareEvaluationConfig.iou,
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
  const summaryRows = [
    {
      id: "average_confidence",
      property: "Average Confidence",
      value: evaluationMetrics.average_confidence,
      compareValue: compareEvaluationMetrics.average_confidence,
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
    },
    {
      id: "tp",
      property: "True Positives",
      value: evaluationMetrics.tp,
      compareValue: compareEvaluationMetrics.tp,
      filterable: true,
    },
    {
      id: "fp",
      property: "False Positives",
      value: evaluationMetrics.fp,
      compareValue: compareEvaluationMetrics.fp,
      lesserIsBetter: true,
      filterable: true,
    },
    {
      id: "fn",
      property: "False Negatives",
      value: evaluationMetrics.fn,
      compareValue: compareEvaluationMetrics.fn,
      lesserIsBetter: true,
      filterable: true,
    },
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
      perClassPerformance[metric].push({
        id: key,
        property: key,
        value: metrics[metric],
        compareValue: compareMetrics[metric],
      });
    }
  }
  const performanceClasses = Object.keys(perClassPerformance);
  const classPerformance = formatPerClassPerformance(
    perClassPerformance[performanceClass],
    barConfigState
  );

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
          <Typography color="secondary">Compare against</Typography>
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
          {can_edit_note && (
            <Box>
              <IconButton
                size="small"
                color="secondary"
                sx={{ borderRadius: 16 }}
                onClick={() => {
                  setEditNoteState((note) => ({ ...note, open: true }));
                }}
              >
                <EditNote />
              </IconButton>
            </Box>
          )}
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
                      th: {
                        color: (theme) => theme.palette.text.secondary,
                        fontSize: "1rem",
                        fontWeight: 600,
                      },
                    }}
                  >
                    <TableCell>Metric</TableCell>
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
                        <TableCell>Difference</TableCell>
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
                    } = row;
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
                    const ratioColor = positiveRatio ? "#8BC18D" : "#FF6464";
                    const showTrophy = lesserIsBetter
                      ? difference < 0
                      : difference > 0;

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
                            <Typography>{formatValue(value)}</Typography>
                            <Stack direction="row" spacing={1}>
                              {showTrophy && (
                                <Typography sx={{ fontSize: 12 }}>
                                  🏆
                                </Typography>
                              )}
                              {filterable && (
                                <IconButton
                                  sx={{ p: 0 }}
                                  onClick={() => {
                                    loadView("field", { field: rowId });
                                  }}
                                  title="Load view"
                                >
                                  <GridView sx={{ fontSize: 16 }} />
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
                                  {formatValue(compareValue)}
                                </Typography>

                                {filterable && (
                                  <IconButton
                                    sx={{ p: 0 }}
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
                                    {positiveRatio ? (
                                      <ArrowDropUp sx={{ color: ratioColor }} />
                                    ) : (
                                      <ArrowDropDown
                                        sx={{ color: ratioColor }}
                                      />
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
                        y: metricPerformance.map((m) => m.value),
                        x: metricPerformance.map((m) => m.property),
                        type: "histogram",
                        name: name,
                        marker: {
                          color: KEY_COLOR,
                        },
                      },
                      {
                        histfunc: "sum",
                        y: metricPerformance.map((m) => m.compareValue),
                        x: metricPerformance.map((m) => m.property),
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
                          th: {
                            color: (theme) => theme.palette.text.secondary,
                            fontSize: "1rem",
                            fontWeight: 600,
                          },
                        }}
                      >
                        <TableCell>Metric</TableCell>
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
                            <TableCell>Difference</TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {metricPerformance.map((row) => (
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
                    {classMode === "chart" && (
                      <IconButton
                        onClick={() => {
                          setBarConfigDialogState((state) => ({
                            ...state,
                            open: true,
                          }));
                        }}
                      >
                        <Settings />
                      </IconButton>
                    )}
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
                        selectedpoints: viewState.view.selectedClasses,
                      },
                      {
                        histfunc: "sum",
                        y: classPerformance.map(
                          (metrics) => metrics.compareValue
                        ),
                        x: classPerformance.map((metrics) => metrics.property),
                        type: "histogram",
                        name: `${CLASS_LABELS[performanceClass]} per class`,
                        marker: {
                          color: COMPARE_KEY_COLOR,
                        },
                        key: compareKey,
                        selectedpoints: viewState.view.selectedCompareClasses,
                      },
                    ]}
                    onClick={({ points }) => {
                      const x = points[0]?.x;
                      const key = points[0]?.data.key;
                      const isCompare = key === compareKey;
                      const index = points[0]?.pointIndices[0];
                      const viewStateX = viewState.view.x;
                      if (viewStateX === x) {
                        setViewState({ type: "", view: {} });
                        loadView("clear", {});
                        return;
                      }
                      setViewState({
                        type: "class",
                        view: {
                          x,
                          selectedClasses: isCompare ? [] : [index],
                          selectedCompareClasses: isCompare ? [index] : [],
                        },
                      });
                      loadView("class", { x });
                    }}
                  />
                )}
                {classMode === "table" && (
                  <EvaluationTable>
                    <TableHead>
                      <TableRow
                        sx={{
                          th: {
                            color: (theme) => theme.palette.text.secondary,
                            fontSize: "1rem",
                            fontWeight: 600,
                          },
                        }}
                      >
                        <TableCell>Metric</TableCell>
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
                            <TableCell>Difference</TableCell>
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
                        colorscale: "viridis",
                      },
                    ]}
                    onClick={({ points }) => {
                      const firstPoint = points[0];
                      loadView("matrix", { x: firstPoint.x, y: firstPoint.y });
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
                        },
                      ]}
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
                  th: {
                    color: (theme) => theme.palette.text.secondary,
                    fontSize: "1rem",
                    fontWeight: 600,
                  },
                }}
              >
                <TableCell>Property</TableCell>
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
              {infoRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell component="th" scope="row">
                    {row.property}
                  </TableCell>
                  <TableCell>{formatValue(row.value)}</TableCell>
                  {compareKey && (
                    <TableCell>{formatValue(row.compareValue)}</TableCell>
                  )}
                </TableRow>
              ))}
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
            multiline
            rows={3}
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
        open={barConfigDialogState.open}
        fullWidth
        onClose={closeBarConfigDialog}
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
                setBarConfigDialogState((state) => ({
                  ...state,
                  sortBy: e.target.value as string,
                }));
              }}
              defaultValue={barConfigDialogState.sortBy}
            >
              <MenuItem value="best">Best Performing</MenuItem>
              <MenuItem value="worst">Worst Performing</MenuItem>
            </Select>
          </Stack>
          <Stack spacing={1} pt={1}>
            <Typography color="secondary">Limit bars:</Typography>
            <TextField
              defaultValue={barConfigDialogState.limit}
              size="small"
              type="number"
              onChange={(e) => {
                setBarConfigDialogState((state) => ({
                  ...state,
                  limit: parseInt(e.target.value),
                }));
              }}
            />
          </Stack>
          <Stack direction="row" spacing={1} pt={2}>
            <Button
              variant="outlined"
              color="secondary"
              sx={{ width: "100%" }}
              onClick={closeBarConfigDialog}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              sx={{ width: "100%" }}
              disabled={
                barConfigDialogState.sortBy === "" ||
                barConfigDialogState.limit === 0
              }
              onClick={() => {
                setBarConfigState(barConfigDialogState);
                closeBarConfigDialog();
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
  if (!barConfig.sortBy || !barConfig.limit) return perClassPerformance;

  const sorted = perClassPerformance.sort((a, b) => {
    if (barConfig.sortBy === "best") {
      return b.value - a.value;
    } else {
      return a.value - b.value;
    }
  });
  return sorted.slice(0, barConfig.limit);
}
