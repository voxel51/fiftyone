import {
  Button,
  CircularProgress,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import EvaluationPlot from "./EvaluationPlot";
import { isNullish } from "@fiftyone/utilities";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { useTriggerEvent } from "./utils";

const CONFIGURE_SCENARIO_ACTION = "@voxel51/scenario/configure_scenario";

export default function EvaluationScenarioAnalysis(props) {
  const { evaluation, data, loadScenario } = props;
  const { scenarios } = evaluation;
  const [selectedScenario, setSelectedScenario] = useState(null);
  const panelId = usePanelId();
  const promptOperator = usePanelEvent();
  const triggerEvent = useTriggerEvent();
  const evaluationInfo = evaluation.info;
  const evaluationConfig = evaluationInfo.config;

  const scenariosArray = scenarios ? Object.values(scenarios) : [];
  const isEmpty = scenariosArray.length === 0;

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }} spacing={2}>
        {/* todo@im: remove button below. Only for generating mock data */}
        <Button
          variant="outlined"
          onClick={() => {
            triggerEvent(
              "@voxel51/panels/model_evaluation_panel_builtin#generate"
            );
          }}
        >
          Generate
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            promptOperator(panelId, {
              params: {
                gt_field: evaluationConfig.gt_field,
                scenario_type: "custom_code",
                scenario_name: "test", // # TODO: Edit will pass current name
              },
              operator: CONFIGURE_SCENARIO_ACTION,
              prompt: true,
              // callback: (result, opts) => {
              //   console.log("params", opts.ctx.params);
              //   onSaveScenario({ subset: opts.ctx.params });
              //   // TODO: save the subset

              //   // TODO: error handling
              // },
            });
          }}
        >
          Create New Scenario
        </Button>
      </Stack>
      {isEmpty ? (
        <Typography>No scenarios found!</Typography>
      ) : (
        <Stack>
          <Typography>Select a scenario:</Typography>
          <Select
            size="small"
            onChange={(e) => {
              setSelectedScenario(e.target.value);
            }}
          >
            {scenariosArray.map((scenario) => {
              const { id, name } = scenario;
              return (
                <MenuItem value={id} key={id}>
                  <Typography>{name}</Typography>
                </MenuItem>
              );
            })}
          </Select>
        </Stack>
      )}
      {selectedScenario && (
        <Scenario
          key={selectedScenario}
          id={selectedScenario}
          data={data}
          loadScenario={loadScenario}
        />
      )}
    </Stack>
  );
}

function Scenario(props) {
  const { id, data, loadScenario } = props;
  const [loading, setLoading] = useState(true);
  const [subset, setSubset] = useState("");
  const scenario = data?.[`scenario_${id}`];
  const subsets = scenario?.subsets || [];
  const subsetsData = scenario?.subsets_data || {};

  useEffect(() => {
    if (!scenario) {
      loadScenario(id);
    }
  }, [scenario]);

  if (!scenario) {
    return <CircularProgress />;
  }

  return (
    <Stack>
      <Typography>Select a subset:</Typography>
      <Select
        size="small"
        onChange={(e) => {
          setSubset(e.target.value);
        }}
      >
        {subsets.map((subset) => {
          return (
            <MenuItem value={subset} key={subset}>
              <Typography>{subset}</Typography>
            </MenuItem>
          );
        })}
      </Select>
      {subset && <ScenarioModelPerformance data={subsetsData[subset]} />}
    </Stack>
  );
}

const MODEL_PERFORMANCE_METRICS = [
  { label: "F1 Score", key: "fscore" },
  { label: "Precision", key: "precision" },
  { label: "Recall", key: "recall" },
  { label: "IoU", key: "iou" },
  { label: "mAP", key: "mAP" },
  { label: "Average Confidence", key: "average_confidence" },
];

function ScenarioModelPerformance(props) {
  const { data } = props;

  const theta = [];
  const r = [];
  for (const metric of MODEL_PERFORMANCE_METRICS) {
    const { label, key } = metric;
    const value = data[key];
    if (isNullish(value)) continue;
    theta.push(label);
    r.push(value);
  }

  return (
    <EvaluationPlot
      data={[
        {
          type: "scatterpolar",
          r,
          theta,
          fill: "toself",
        },
      ]}
      layout={{
        polar: {
          bgcolor: "#272727",
          radialaxis: {
            visible: true,
          },
        },
      }}
    />
  );
}
