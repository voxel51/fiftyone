import { Plot } from "@fiftyone/components/src/components/Plot";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { formatValueAsNumber } from "@fiftyone/utilities";
import { InsertChartOutlined, TableChartOutlined } from "@mui/icons-material";
import {
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ColorSquare from "../../components/ColorSquare";
import EvaluationTable from "../../components/EvaluationTable";
import { COMPARE_KEY_COLOR, KEY_COLOR } from "../../constants";
import { getNumericDifference } from "../../utils";

export default function MetricPerformance(props) {
  const { name, compareKey, evaluation, compareEvaluation, id } = props;
  const [metricMode, setMetricMode] = usePanelStatePartial(
    `${id}_mpvm`,
    "chart"
  );

  const evaluationInfo = evaluation.info;
  const evaluationConfig = evaluationInfo.config;
  const evaluationMetrics = evaluation.metrics;
  const evaluationType = evaluationConfig.type;
  const compareEvaluationInfo = compareEvaluation?.info || {};
  const compareEvaluationConfig = compareEvaluationInfo?.config || {};
  const compareEvaluationMetrics = compareEvaluation?.metrics || {};
  const isObjectDetection = evaluationType === "detection";
  const isSegmentation = evaluationType === "segmentation";
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

  return (
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
            <InsertChartOutlined />
          </ToggleButton>
          <ToggleButton value="table">
            <TableChartOutlined />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {metricMode === "chart" && (
        <Plot
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
                <TableCell>{formatValueAsNumber(row.value)}</TableCell>
                {compareKey && (
                  <>
                    <TableCell>
                      {formatValueAsNumber(row.compareValue)}
                    </TableCell>
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
    </Stack>
  );
}
