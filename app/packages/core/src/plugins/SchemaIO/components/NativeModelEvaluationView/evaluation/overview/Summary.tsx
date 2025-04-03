import { ArrowDropDown, ArrowDropUp, GridView } from "@mui/icons-material";
import {
  IconButton,
  Stack,
  SxProps,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import React from "react";
import ColorSquare from "../../components/ColorSquare";
import EvaluationTable from "../../components/EvaluationTable";
import { COMPARE_KEY_COLOR, KEY_COLOR } from "../../constants";
import { formatValue, getNumericDifference } from "../../utils";
import { useActiveFilter } from "./utils";
import { get } from "lodash";

export default function Summary(props) {
  const { name, compareKey, loadView, evaluation, compareEvaluation } = props;
  const activeFilter = useActiveFilter(evaluation, compareEvaluation);
  const theme = useTheme();

  const evaluationInfo = evaluation.info;
  const evaluationConfig = evaluationInfo.config;
  const evaluationMetrics = evaluation.metrics;
  const evaluationType = evaluationConfig.type;
  const evaluationMethod = evaluationConfig.method;
  const compareEvaluationInfo = compareEvaluation?.info || {};
  const compareEvaluationConfig = compareEvaluationInfo?.config || {};
  const compareEvaluationMetrics = compareEvaluation?.metrics || {};
  const isObjectDetection = evaluationType === "detection";
  const isClassification = evaluationType === "classification";
  const isSegmentation = evaluationType === "segmentation";
  const isBinaryClassification =
    evaluationType === "classification" && evaluationMethod === "binary";
  const showTpFpFn = isObjectDetection || isBinaryClassification;
  const isNoneBinaryClassification =
    isClassification && evaluationMethod !== "binary";

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

  return (
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
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
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
          const difference = getNumericDifference(value, compareValue);
          const ratio = getNumericDifference(value, compareValue, true, 1);
          const positiveRatio = ratio > 0;
          const zeroRatio = ratio === 0;
          const negativeRatio = ratio < 0;
          const ratioColor = positiveRatio
            ? "#8BC18D"
            : negativeRatio
            ? "#FF6464"
            : theme.palette.text.tertiary;
          const showTrophy = lesserIsBetter ? difference < 0 : difference > 0;
          const activeStyle: SxProps = {
            backgroundColor: theme.palette.voxel["500"],
            color: "#FFFFFF",
          };

          return (
            <TableRow key={rowId}>
              <TableCell scope="row">{property}</TableCell>
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
                      <Typography sx={{ fontSize: 12 }}>🏆</Typography>
                    )}
                    {filterable && (
                      <IconButton
                        sx={{
                          p: 0.25,
                          borderRadius: 0.5,
                          ...(active === "selected" ? activeStyle : {}),
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
                          <Typography color="text.tertiary">—</Typography>
                        )}
                      </Typography>

                      {filterable && (
                        <IconButton
                          sx={{
                            p: 0.25,
                            borderRadius: 0.5,
                            ...(active === "compare" ? activeStyle : {}),
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
                        <Stack direction="row" sx={{ alignItems: "center" }}>
                          {positiveRatio && (
                            <ArrowDropUp sx={{ color: ratioColor }} />
                          )}
                          {negativeRatio && (
                            <ArrowDropDown sx={{ color: ratioColor }} />
                          )}
                          {zeroRatio && (
                            <Typography pr={1} sx={{ color: ratioColor }}>
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
  );
}

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
  const customMetrics = (get(evaluationMetrics, "custom_metrics", null) ||
    {}) as CustomMetrics;
  for (const [operatorUri, customMetric] of Object.entries(customMetrics)) {
    const compareValue = get(
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
