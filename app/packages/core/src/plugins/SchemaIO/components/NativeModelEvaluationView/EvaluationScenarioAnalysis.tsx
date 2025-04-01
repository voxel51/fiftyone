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

const CONFIGURE_SCENARIO_ACTION = "model_evaluation_configure_scenario";

export default function EvaluationScenarioAnalysis(props) {
  const { evaluation, data, loadScenario } = props;
  const { scenarios } = evaluation;
  const [selectedScenario, setSelectedScenario] = useState(
    getDefaultScenario(scenarios)
  );
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
                scenario_type: "view",
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
            defaultValue={selectedScenario}
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
  const scenario = data?.[`scenario_${id}`];

  useEffect(() => {
    if (!scenario) {
      loadScenario(id);
    }
  }, [scenario]);

  if (!scenario) {
    return <CircularProgress />;
  }

  console.log(">>>", scenario);

  return <ScenarioCharts data={scenario} />;
}

function ScenarioCharts(props) {
  const { data } = props;
  return (
    <Stack>
      <ScenarioPredictionStatistics data={data} />
      <ScenarioModelPerformance data={data} />
      <ScenarioConfusionMatrix data={data} />
      <ScenarioConfidenceDistribution data={data} />
      <ScenarioMetricPerformance data={data} />
      <ScenarioSubsetDistribution data={data} />
    </Stack>
  );
}

const MODEL_PERFORMANCE_METRICS = [
  { label: "Average Confidence", key: "average_confidence" },
  { label: "F1 Score", key: "fscore" },
  { label: "Precision", key: "precision" },
  { label: "Recall", key: "recall" },
  { label: "IoU", key: "iou" },
  { label: "mAP", key: "mAP" },
];

function ScenarioModelPerformance(props) {
  const { data } = props;
  const { subsets } = data;
  const [subset, setSubset] = useState(subsets[0]);
  const subsetData = data.subsets_data[subset];
  const { metrics } = subsetData;

  const theta = [];
  const r = [];
  for (const metric of MODEL_PERFORMANCE_METRICS) {
    const { label, key } = metric;
    const value = metrics[key];
    if (isNullish(value)) continue;
    theta.push(label);
    r.push(value);
  }

  return (
    <Stack>
      <Typography variant="h5">Model Performance</Typography>
      <Typography>Select a subset:</Typography>
      <Select
        size="small"
        defaultValue={subset}
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
    </Stack>
  );
}

function ScenarioPredictionStatistics(props) {
  const { data } = props;
  const { subsets_data } = data;

  const x = ["True Positives", "False Positives", "False Negatives"];
  const plotData = [];

  for (const subset in subsets_data) {
    const subsetData = subsets_data[subset];
    const y = [
      subsetData.metrics.tp,
      subsetData.metrics.fp,
      subsetData.metrics.fn,
    ];
    plotData.push({ x, y, name: subset, type: "bar" });
  }

  return (
    <Stack>
      <Typography variant="h5">Prediction Statistics</Typography>

      <EvaluationPlot data={plotData} />
    </Stack>
  );
}

function ScenarioConfusionMatrix(props) {
  const { data } = props;
  const { subsets_data } = data;

  const zValues = [
    [1, null, 30, 50, 1],
    [20, 1, 60, 80, 30],
    [30, 60, 1, -10, 20],
  ];

  const plotData = [
    {
      z: zValues,
      x: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      y: ["Morning", "Afternoon", "Evening"],
      texttemplate: "%{z}",
      type: "heatmap",
      hoverongaps: false,
    },
  ];

  return (
    <Stack>
      <Typography variant="h5">Prediction Statistics</Typography>

      <EvaluationPlot data={plotData} />
    </Stack>
  );
}

function ScenarioConfidenceDistribution(props) {
  const { data } = props;
  const { subsets, subsets_data } = data;

  const plotData = [];

  for (const subset in subsets_data) {
    const subsetData = subsets_data[subset];
    plotData.push({ y: subsetData.confidences, name: subset, type: "box" });
  }

  return (
    <Stack>
      <Typography variant="h5">Confidence Distribution</Typography>

      <EvaluationPlot data={plotData} />
    </Stack>
  );
}

function ScenarioMetricPerformance(props) {
  const { data } = props;
  const { subsets, subsets_data } = data;
  const [metric, setMetric] = useState("average_confidence");

  const y = subsets.map((subset) => {
    const subsetData = subsets_data[subset];
    return subsetData.metrics[metric];
  });

  const plotData = [{ x: subsets, y, type: "bar" }];

  return (
    <Stack>
      <Typography variant="h5">Metric Performance</Typography>
      <Typography>Select metric:</Typography>
      <Select
        size="small"
        defaultValue={metric}
        onChange={(e) => {
          setMetric(e.target.value);
        }}
      >
        {MODEL_PERFORMANCE_METRICS.map(({ key, label }) => {
          return (
            <MenuItem value={key} key={key}>
              <Typography>{label}</Typography>
            </MenuItem>
          );
        })}
      </Select>
      <EvaluationPlot data={plotData} />
    </Stack>
  );
}

function ScenarioSubsetDistribution(props) {
  const { data } = props;
  const { subsets, subsets_data } = data;

  const y = subsets.map((subset) => {
    const subsetData = subsets_data[subset];
    return subsetData.distribution;
  });

  const plotData = [{ x: subsets, y, type: "bar" }];

  return (
    <Stack>
      <Typography variant="h5">Subset Distribution</Typography>
      <EvaluationPlot data={plotData} />
    </Stack>
  );
}

function getDefaultScenario(scenarios) {
  if (!scenarios) return null;
  const scenarioIds = Object.keys(scenarios);
  if (scenarioIds.length === 0) return null;
  return scenarioIds[0];
}
