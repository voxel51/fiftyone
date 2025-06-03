import {
  Card,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import React from "react";
import EvaluationTable from "../components/EvaluationTable";
import ColorSquare from "../components/ColorSquare";
import { COMPARE_KEY_COLOR, KEY_COLOR } from "../constants";
import { formatValue } from "../utils";
import { formatValueAsNumber } from "@fiftyone/utilities";

export default function Info(props) {
  const { name, compareKey, evaluation, compareEvaluation } = props;

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

  return (
    <Card sx={{ p: 2, overflow: "auto" }}>
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
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
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
                <TableCell>{formatValueAsNumber(row.value)}</TableCell>
                {compareKey && (
                  <TableCell>{formatValueAsNumber(row.compareValue)}</TableCell>
                )}
              </TableRow>
            )
          )}
        </TableBody>
      </EvaluationTable>
    </Card>
  );
}
