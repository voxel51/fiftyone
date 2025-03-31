import React from "react";
import {
  Card,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { formatValue } from "../utils";

interface ExecutionInfoProps {
  evaluation: any;
  compareKey?: string;
  compareEvaluation?: any;
  name: string;
}

export default function ExecutionInfo({
  evaluation,
  compareKey,
  compareEvaluation,
  name,
}: ExecutionInfoProps) {
  const evaluationInfo = evaluation.info;
  const evaluationKey = evaluationInfo.key;
  const evaluationTimestamp = evaluationInfo.timestamp;
  const evaluationConfig = evaluationInfo.config;
  const evaluationType = evaluationConfig.type;
  const evaluationMethod = evaluationConfig.method;
  const compareEvaluationInfo = compareEvaluation?.info || {};
  const compareEvaluationKey = compareEvaluationInfo?.key;
  const compareEvaluationTimestamp = compareEvaluationInfo?.timestamp;
  const compareEvaluationConfig = compareEvaluationInfo?.config || {};
  const isObjectDetection = evaluationType === "detection";
  const isClassification = evaluationType === "classification";
  const isSegmentation = evaluationType === "segmentation";
  const isBinaryClassification =
    evaluationType === "classification" && evaluationMethod === "binary";
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
    <Card sx={{ p: 2 }}>
      <Table size="small">
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
                <ColorSquare color="#ff6d04" />
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
                  <ColorSquare color="#03a9f4" />
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
      </Table>
    </Card>
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
