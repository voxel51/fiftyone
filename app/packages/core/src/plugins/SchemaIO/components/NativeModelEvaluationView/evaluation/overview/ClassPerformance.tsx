import { Dialog } from "@fiftyone/components";
import {
  InsertChartOutlined,
  Settings,
  TableChartOutlined,
} from "@mui/icons-material";
import {
  Button,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import React, { useMemo, useState } from "react";
import ColorSquare from "../../components/ColorSquare";
import EvaluationTable from "../../components/EvaluationTable";
import { COMPARE_KEY_COLOR, KEY_COLOR } from "../../constants";
import EvaluationPlot from "../../EvaluationPlot";
import { formatValue, getNumericDifference } from "../../utils";
import { DEFAULT_BAR_CONFIG } from "../../constants";
import { PLOT_CONFIG_DIALOG_TYPE, PLOT_CONFIG_TYPE } from "./types";
import { getConfigLabel, useActiveFilter } from "./utils";

export default function ClassPerformance(props) {
  const { evaluation, compareEvaluation, loadView, name, compareKey } = props;
  const [classPerformanceConfig, setClassPerformanceConfig] =
    useState<PLOT_CONFIG_TYPE>({});
  const [classPerformanceDialogConfig, setClassPerformanceDialogConfig] =
    useState<PLOT_CONFIG_DIALOG_TYPE>(DEFAULT_BAR_CONFIG);
  const [classMode, setClassMode] = useState("chart");
  const [performanceClass, setPerformanceClass] = useState("precision");
  const evaluationMaskTargets = useMemo(() => {
    return evaluation?.mask_targets || {};
  }, [evaluation]);
  const compareEvaluationMaskTargets = useMemo(() => {
    return compareEvaluation?.mask_targets || {};
  }, [compareEvaluation]);
  const activeFilter = useActiveFilter(evaluation, compareEvaluation);

  const closeClassPerformanceConfigDialog = () => {
    setClassPerformanceDialogConfig((state) => ({ ...state, open: false }));
  };
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
              <InsertChartOutlined />
            </ToggleButton>
            <ToggleButton value="table">
              <TableChartOutlined />
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
              y: classPerformance.map((metrics) => metrics.compareValue),
              x: classPerformance.map(
                (metrics) => metrics.compareProperty || metrics.property
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
          layout={{
            xaxis: { type: "category" },
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
                    <TableCell>{formatValue(row.compareValue)}</TableCell>
                    <TableCell>
                      {getNumericDifference(row.value, row.compareValue)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </EvaluationTable>
      )}

      <Dialog
        open={Boolean(classPerformanceDialogConfig.open)}
        fullWidth
        onClose={closeClassPerformanceConfigDialog}
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
    </Stack>
  );
}

const CLASS_LABELS = {
  "f1-score": "F1-Score",
  precision: "Precision",
  recall: "Recall",
  confidence: "Confidence",
  iou: "IoU",
};
const CLASSES = Object.keys(CLASS_LABELS);
const EXCLUDED_CLASSES = ["macro avg", "micro avg", "weighted avg"];

const CLASS_PERFORMANCE_SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "az", label: "Alphabetical (A-Z)" },
  { value: "za", label: "Alphabetical (Z-A)" },
  { value: "best", label: "Best performing" },
  { value: "worst", label: "Worst performing" },
];

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
