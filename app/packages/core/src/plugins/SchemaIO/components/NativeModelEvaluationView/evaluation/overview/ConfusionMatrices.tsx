import { Box, Stack, Typography } from "@mui/material";
import React, { useMemo, useState } from "react";
import ColorSquare from "../../components/ColorSquare";
import ConfusionMatrixConfig from "../../components/ConfusionMatrixConfig";
import { COMPARE_KEY_COLOR, KEY_COLOR } from "../../constants";
import EvaluationPlot from "../../EvaluationPlot";
import { getMatrix } from "../../utils";
import { PLOT_CONFIG_TYPE } from "./types";
import { getConfigLabel } from "./utils";

export default function ConfusionMatrices(props) {
  const { evaluation, compareEvaluation, name, compareKey, loadView } = props;
  const [confusionMatrixConfig, setConfusionMatrixConfig] =
    useState<PLOT_CONFIG_TYPE>({ log: true });

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

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between" }}>
        <Typography color="secondary">
          {getConfigLabel({ config: confusionMatrixConfig })}
        </Typography>
        <ConfusionMatrixConfig
          config={confusionMatrixConfig}
          onSave={setConfusionMatrixConfig}
        />
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
    </Box>
  );
}
