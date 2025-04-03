import { Dialog } from "@fiftyone/components";
import { Settings } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { useMemo, useState } from "react";
import ColorSquare from "../../components/ColorSquare";
import { COMPARE_KEY_COLOR, KEY_COLOR } from "../../constants";
import EvaluationPlot from "../../EvaluationPlot";
import { DEFAULT_BAR_CONFIG, NONE_CLASS } from "./constants";
import { PLOT_CONFIG_DIALOG_TYPE, PLOT_CONFIG_TYPE } from "./types";
import { getConfigLabel } from "./utils";

export default function ConfusionMatrices(props) {
  const { evaluation, compareEvaluation, name, compareKey, loadView } = props;
  const [confusionMatrixConfig, setConfusionMatrixConfig] =
    useState<PLOT_CONFIG_TYPE>({ log: true });
  const [confusionMatrixDialogConfig, setConfusionMatrixDialogConfig] =
    useState<PLOT_CONFIG_DIALOG_TYPE>(DEFAULT_BAR_CONFIG);

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

  const closeConfusionMatrixConfigDialog = () => {
    setConfusionMatrixDialogConfig((state) => ({ ...state, open: false }));
  };

  return (
    <Box>
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
                    `${evaluation?.info?.config?.gt_field || "truth"}: %{y}`,
                    `${
                      evaluation?.info?.config?.pred_field || "predicted"
                    }: %{x}`,
                  ].join(" <br>") + "<extra></extra>",
              },
            ]}
            onClick={({ points }) => {
              const firstPoint = points[0];
              loadView("matrix", {
                x: firstPoint.x,
                y: firstPoint.y,
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
        {compareKey && (
          <Stack sx={{ width: "100%" }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                justifyContent: "center",
              }}
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
                      `${evaluation?.info?.config?.gt_field || "truth"}: %{y}`,
                      `${
                        evaluation?.info?.config?.pred_field || "predicted"
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
    </Box>
  );
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

const CONFUSION_MATRIX_SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "az", label: "Alphabetical (A-Z)" },
  { value: "za", label: "Alphabetical (Z-A)" },
  { value: "mc", label: "Most common classes" },
  { value: "lc", label: "Least common classes" },
];
