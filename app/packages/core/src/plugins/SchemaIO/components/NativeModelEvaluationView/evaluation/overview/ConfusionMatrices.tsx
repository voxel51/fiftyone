import { Plot } from "@fiftyone/components/src/components/Plot";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { Box, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import ColorSquare from "../../components/ColorSquare";
import ConfusionMatrixConfig from "../../components/ConfusionMatrixConfig";
import {
  COMPARE_KEY_COLOR,
  DEFAULT_CONFUSION_MATRIX_CONFIG,
  KEY_COLOR,
} from "../../constants";
import { getClasses, getConfusionMatrixPlotlyData } from "../../utils";
import { PLOT_CONFIG_TYPE } from "./types";

export default function ConfusionMatrices(props) {
  const { evaluation, compareEvaluation, name, compareKey, loadView, id } =
    props;
  const [confusionMatrixConfig, setConfusionMatrixConfig] =
    usePanelStatePartial<PLOT_CONFIG_TYPE>(
      `${id}_cmc`,
      DEFAULT_CONFUSION_MATRIX_CONFIG
    );

  const evaluationMaskTargets = useMemo(() => {
    return evaluation?.mask_targets || {};
  }, [evaluation]);
  const compareEvaluationMaskTargets = useMemo(() => {
    return compareEvaluation?.mask_targets || {};
  }, [compareEvaluation]);
  const confusionMatrixPlotlyData = useMemo(() => {
    const {
      matrix,
      classes,
      oranges_colorscale,
      oranges_logarithmic_colorscale,
    } = evaluation?.confusion_matrix || {};
    return getConfusionMatrixPlotlyData(
      {
        classes,
        matrix,
        colorscales: {
          default: oranges_colorscale,
          logarithmic: oranges_logarithmic_colorscale,
        },
        maskTargets: { primary: evaluationMaskTargets },
      },
      confusionMatrixConfig
    );
  }, [evaluation, confusionMatrixConfig, evaluationMaskTargets]);
  const compareConfusionMatrixPlotlyData = useMemo(() => {
    const { matrix, classes, blues_colorscale, blues_logarithmic_colorscale } =
      compareEvaluation?.confusion_matrix || {};
    if (matrix && classes) {
      return getConfusionMatrixPlotlyData(
        {
          classes,
          matrix,
          colorscales: {
            default: blues_colorscale,
            logarithmic: blues_logarithmic_colorscale,
          },
          maskTargets: {
            primary: compareEvaluationMaskTargets,
            secondary: evaluationMaskTargets,
          },
        },
        confusionMatrixConfig
      );
    }
    return [];
  }, [
    compareEvaluation,
    confusionMatrixConfig,
    evaluationMaskTargets,
    compareEvaluationMaskTargets,
  ]);
  const classes = getClasses(
    evaluation?.confusion_matrix,
    evaluationMaskTargets
  );

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end">
        <ConfusionMatrixConfig
          config={confusionMatrixConfig}
          onSave={setConfusionMatrixConfig}
          classes={classes}
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
          <Plot
            data={confusionMatrixPlotlyData}
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
            <Plot
              data={compareConfusionMatrixPlotlyData}
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
