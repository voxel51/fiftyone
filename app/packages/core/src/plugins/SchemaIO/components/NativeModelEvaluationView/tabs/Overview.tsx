import React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  Dialog,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  ArrowDropDown,
  ArrowDropUp,
  EditNote,
  InsertChart,
  Settings,
  TableRows,
} from "@mui/icons-material";
import { ExpandMore } from "@mui/icons-material";
import { useRecoilState } from "recoil";
import { editingFieldAtom } from "@fiftyone/state";
import { EvaluationTable } from "../styles";
import EvaluationNotes from "../EvaluationNotes";
import EvaluationPlot from "../EvaluationPlot";
import { formatValue, getNumericDifference } from "../utils";

interface OverviewProps {
  mode: string;
  expanded: string;
  setExpanded: (expanded: string) => void;
  evaluationNotes: string;
  can_edit_note: boolean;
  setEditNoteState: (state: { open: boolean; note: string }) => void;
  evaluation: any;
  compareKey: string;
  name: string;
  compareEvaluation: any;
  activeFilter: any;
  loadView: (type: string, params: any) => void;
  setNoteEvent: string;
  triggerEvent: (event: string, params: any) => void;
  closeNoteDialog: () => void;
  editNoteState: { open: boolean; note: string };
  KEY_COLOR: string;
  COMPARE_KEY_COLOR: string;
}

export default function Overview({
  mode,
  expanded,
  setExpanded,
  evaluationNotes,
  can_edit_note,
  setEditNoteState,
  evaluation,
  compareKey,
  name,
  compareEvaluation,
  activeFilter,
  loadView,
  setNoteEvent,
  triggerEvent,
  closeNoteDialog,
  editNoteState,
  KEY_COLOR,
  COMPARE_KEY_COLOR,
}: OverviewProps) {
  const setEditingField = useRecoilState(editingFieldAtom);
  const [metricMode, setMetricMode] = React.useState("chart");
  const [classMode, setClassMode] = React.useState("chart");
  const [performanceClass, setPerformanceClass] = React.useState("precision");

  const summaryRows = [
    {
      id: "average_confidence",
      property: "Average Confidence",
      value: evaluation?.metrics?.average_confidence,
      compareValue: compareEvaluation?.metrics?.average_confidence,
      hide: evaluation?.info?.config?.type === "segmentation",
    },
    {
      id: "support",
      property: "Support",
      value: evaluation?.metrics?.support,
      compareValue: compareEvaluation?.metrics?.support,
    },
    {
      id: "accuracy",
      property: "Accuracy",
      value: evaluation?.metrics?.accuracy,
      compareValue: compareEvaluation?.metrics?.accuracy,
    },
    {
      id: "precision",
      property: "Precision",
      value: evaluation?.metrics?.precision,
      compareValue: compareEvaluation?.metrics?.precision,
    },
    {
      id: "recall",
      property: "Recall",
      value: evaluation?.metrics?.recall,
      compareValue: compareEvaluation?.metrics?.recall,
    },
    {
      id: "fscore",
      property: "F1-Score",
      value: evaluation?.metrics?.fscore,
      compareValue: compareEvaluation?.metrics?.fscore,
    },
  ];

  const computedMetricPerformance = [
    {
      id: "average_confidence",
      property: "Average Confidence",
      value: evaluation?.metrics?.average_confidence,
      compareValue: compareEvaluation?.metrics?.average_confidence,
      hide: evaluation?.info?.config?.type === "segmentation",
    },
    {
      id: "precision",
      property: "Precision",
      value: evaluation?.metrics?.precision,
      compareValue: compareEvaluation?.metrics?.precision,
    },
    {
      id: "recall",
      property: "Recall",
      value: evaluation?.metrics?.recall,
      compareValue: compareEvaluation?.metrics?.recall,
    },
    {
      id: "fscore",
      property: "F1-Score",
      value: evaluation?.metrics?.fscore,
      compareValue: compareEvaluation?.metrics?.fscore,
    },
  ].filter((m) => !m.hide);

  const perClassPerformance = {};
  for (const key in evaluation?.per_class_metrics) {
    if (["macro avg", "micro avg", "weighted avg"].includes(key)) continue;
    const metrics = evaluation?.per_class_metrics[key];
    const compareMetrics = compareEvaluation?.per_class_metrics[key] || {};
    for (const metric in metrics) {
      if (
        !["f1-score", "precision", "recall", "confidence", "iou"].includes(
          metric
        )
      )
        continue;
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
  const classPerformance = perClassPerformance[performanceClass] || [];

  return (
    <>
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
                  <TableRow>
                    <TableCell>Metric</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
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
                            alignItems="center"
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
                    if (row.hide) return null;
                    const difference = getNumericDifference(
                      row.value,
                      row.compareValue
                    );
                    const ratio = getNumericDifference(
                      row.value,
                      row.compareValue,
                      true,
                      1
                    );
                    const positiveRatio = ratio > 0;
                    const negativeRatio = ratio < 0;
                    const ratioColor = positiveRatio
                      ? "#8BC18D"
                      : negativeRatio
                      ? "#FF6464"
                      : "#999999";

                    return (
                      <TableRow key={row.id}>
                        <TableCell>{row.property}</TableCell>
                        <TableCell>{formatValue(row.value)}</TableCell>
                        {compareKey && (
                          <>
                            <TableCell>
                              {formatValue(row.compareValue)}
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                              >
                                <Typography>{difference}</Typography>
                                {!isNaN(ratio) && (
                                  <>
                                    {positiveRatio && (
                                      <ArrowDropUp sx={{ color: ratioColor }} />
                                    )}
                                    {negativeRatio && (
                                      <ArrowDropDown
                                        sx={{ color: ratioColor }}
                                      />
                                    )}
                                    <Typography sx={{ color: ratioColor }}>
                                      {ratio}%
                                    </Typography>
                                  </>
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
                      <TableRow>
                        <TableCell>Metric</TableCell>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
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
                                alignItems="center"
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
                      {computedMetricPerformance.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.property}</TableCell>
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
                    {performanceClass === "f1-score"
                      ? "F1-Score"
                      : performanceClass.charAt(0).toUpperCase() +
                        performanceClass.slice(1)}{" "}
                    Per Class
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
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
                      {performanceClasses.map((cls) => (
                        <MenuItem key={cls} value={cls}>
                          {cls === "f1-score"
                            ? "F1-Score"
                            : cls.charAt(0).toUpperCase() + cls.slice(1)}
                        </MenuItem>
                      ))}
                    </Select>
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
                        name: `${
                          performanceClass === "f1-score"
                            ? "F1-Score"
                            : performanceClass.charAt(0).toUpperCase() +
                              performanceClass.slice(1)
                        } per class`,
                        marker: {
                          color: KEY_COLOR,
                        },
                      },
                      {
                        histfunc: "sum",
                        y: classPerformance.map(
                          (metrics) => metrics.compareValue
                        ),
                        x: classPerformance.map((metrics) => metrics.property),
                        type: "histogram",
                        name: `${
                          performanceClass === "f1-score"
                            ? "F1-Score"
                            : performanceClass.charAt(0).toUpperCase() +
                              performanceClass.slice(1)
                        } per class`,
                        marker: {
                          color: COMPARE_KEY_COLOR,
                        },
                      },
                    ]}
                    layout={{
                      xaxis: { type: "category" },
                    }}
                  />
                )}
                {classMode === "table" && (
                  <EvaluationTable>
                    <TableHead>
                      <TableRow>
                        <TableCell>Class</TableCell>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
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
                                alignItems="center"
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
                      {classPerformance.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.property}</TableCell>
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
                <Typography color="secondary">Confusion Matrix</Typography>
              </Stack>
              <Stack direction="row" key={compareKey}>
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
                        z: evaluation?.confusion_matrices?.default_matrix,
                        x: evaluation?.confusion_matrices?.default_classes,
                        y: evaluation?.confusion_matrices?.default_classes,
                        type: "heatmap",
                        colorscale: "viridis",
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
                          z: compareEvaluation?.confusion_matrices
                            ?.default_matrix,
                          x: compareEvaluation?.confusion_matrices
                            ?.default_classes,
                          y: compareEvaluation?.confusion_matrices
                            ?.default_classes,
                          type: "heatmap",
                          colorscale: "viridis",
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

      <Dialog
        open={editNoteState.open}
        fullWidth
        onClose={closeNoteDialog}
        PaperProps={{
          sx: { background: (theme) => theme.palette.background.paper },
        }}
      >
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <EditNote sx={{ fontSize: 16 }} color="secondary" />
            <Typography sx={{ fontSize: 16 }} color="secondary">
              {evaluationNotes ? "Edit" : "Add"} evaluation notes
            </Typography>
          </Stack>
          <TextField
            onFocus={() => setEditingField(true)}
            onBlur={() => setEditingField(false)}
            multiline
            rows={10}
            defaultValue={evaluationNotes}
            placeholder="Note (markdown) for the evaluation..."
            onChange={(e) => {
              setEditNoteState((note) => ({ ...note, note: e.target.value }));
            }}
          />
          <Stack direction="row" spacing={1}>
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
    </>
  );
}

function ColorSquare({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        backgroundColor: color,
        borderRadius: 2,
      }}
    />
  );
}
