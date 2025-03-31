import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { isNullish } from "@fiftyone/utilities";
import { InsertChartOutlined, TableChartOutlined } from "@mui/icons-material";
import {
  Button,
  Card,
  CircularProgress,
  MenuItem,
  Select,
  Stack,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import EvaluationTable from "../../components/EvaluationTable";
import EvaluationPlot from "../../EvaluationPlot";
import { formatValue, useTriggerEvent } from "../../utils";
import EmptyScenario from "./EmptyScenario";
import { scenarioCardStyles } from "../../styles";

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
    <Card sx={{ p: 2 }}>
      <Stack direction="row" sx={scenarioCardStyles.header}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={scenarioCardStyles.title}>
            Scenario Analysis
          </Typography>
          <Typography sx={scenarioCardStyles.newBadge}>NEW</Typography>
        </Stack>
      </Stack>
      {isEmpty ? (
        <EmptyScenario evaluationConfig={evaluationConfig} />
      ) : (
        <Stack direction="row" spacing={1} justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography>Scenario:</Typography>
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
          <Stack direction="row" spacing={1}>
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
                    // TODO: RECENT MERGE BROKE THIS
                    gt_field: evaluationConfig?.gt_field || "ground_truth",
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
    </Card>
  );
}

function Scenario(props) {
  const { id, data, loadScenario } = props;
  const scenario = data?.[`scenario_${id}`];
  const [mode, setMode] = useState("charts");

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
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(e, mode) => {
          setMode(mode);
        }}
        size="small"
      >
        <ToggleButton value="charts">
          <InsertChartOutlined />
        </ToggleButton>
        <ToggleButton value="table">
          <TableChartOutlined />
        </ToggleButton>
      </ToggleButtonGroup>
      {mode === "charts" ? (
        <ScenarioCharts data={scenario} />
      ) : (
        <ScenarioTable data={data} scenario={scenario} />
      )}
    </Stack>
  );
}

function ScenarioTable(props) {
  return (
    <Stack>
      <PredictionStatisticsTable {...props} />
      <ModelPerformanceMetricsTable {...props} />
      <ConfidenceDistributionTable {...props} />
    </Stack>
  );
}

function PredictionStatisticsTable(props) {
  const { scenario, data } = props;
  const { subsets, subsets_data } = scenario;
  const name = data?.view?.key;

  return (
    <Stack>
      <Typography variant="h5">Prediction Statistics</Typography>
      <EvaluationTable variant="card" size="medium">
        <TableHead>
          <TableRow>
            <TableCell>Subset</TableCell>
            <TableCell>{name}</TableCell>
          </TableRow>
        </TableHead>
        {subsets.map((subset) => {
          const subsetData = subsets_data[subset];
          const { metrics } = subsetData;
          return (
            <TableRow key={subset}>
              <TableCell>{subset}</TableCell>
              <TableCell>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1}>
                    <Typography color="secondary">TP:</Typography>
                    <Typography>{metrics.tp}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Typography color="secondary">FP:</Typography>
                    <Typography>{metrics.fp}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Typography color="secondary">FN:</Typography>
                    <Typography>{metrics.fn}</Typography>
                  </Stack>
                </Stack>
              </TableCell>
            </TableRow>
          );
        })}
      </EvaluationTable>
    </Stack>
  );
}

function SelectSubset(props) {
  const { subsets, selected, setSelected } = props;

  return (
    <Stack>
      <Typography>Select a subset:</Typography>
      <Select
        size="small"
        defaultValue={selected}
        onChange={(e) => {
          setSelected(e.target.value);
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
    </Stack>
  );
}

function ModelPerformanceMetricsTable(props) {
  const { scenario, data } = props;
  const { subsets, subsets_data } = scenario;
  const [subset, setSubset] = useState(subsets[0]);
  const name = data?.view?.key;

  return (
    <Stack>
      <Typography variant="h5">Model Performance Metrics</Typography>
      <SelectSubset
        subsets={subsets}
        selected={subset}
        setSelected={setSubset}
      />
      <EvaluationTable variant="card" size="medium">
        <TableHead>
          <TableRow>
            <TableCell>Metric</TableCell>
            <TableCell>{name}</TableCell>
          </TableRow>
        </TableHead>
        {MODEL_PERFORMANCE_METRICS.map(({ label, key }) => {
          const subsetData = subsets_data[subset];
          const { metrics } = subsetData;
          const value = metrics[key];
          return (
            <TableRow key={key}>
              <TableCell>{label}</TableCell>
              <TableCell>{formatValue(value)}</TableCell>
            </TableRow>
          );
        })}
      </EvaluationTable>
    </Stack>
  );
}

function ConfidenceDistributionTable(props) {
  const { scenario, data } = props;
  const { subsets, subsets_data } = scenario;
  const name = data?.view?.key;

  return (
    <Stack>
      <Typography variant="h5">Confidence Distribution</Typography>
      <EvaluationTable variant="card" size="medium">
        <TableHead>
          <TableRow>
            <TableCell>Subset</TableCell>
            <TableCell>{name} (Average Confidence)</TableCell>
          </TableRow>
        </TableHead>
        {subsets.map((subset) => {
          const subsetData = subsets_data[subset];
          const { metrics } = subsetData;
          return (
            <TableRow key={subset}>
              <TableCell>{subset}</TableCell>
              <TableCell>{formatValue(metrics.average_confidence)}</TableCell>
            </TableRow>
          );
        })}
      </EvaluationTable>
    </Stack>
  );
}

function ScenarioCharts(props) {
  const { data } = props;
  return (
    <Stack>
      <PredictionStatisticsChart data={data} />
      <ScenarioModelPerformance data={data} />
      <ConfusionMatrixChart data={data} />
      <ConfidenceDistributionChart data={data} />
      <MetricPerformanceChart data={data} />
      <SubsetDistributionChart data={data} />
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
      <SelectSubset
        subsets={subsets}
        selected={subset}
        setSelected={setSubset}
      />
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

function PredictionStatisticsChart(props) {
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

function ConfusionMatrixChart(props) {
  const { data } = props;
  const { subsets } = data;
  const [subset, setSubset] = useState(subsets[0]);
  const subsetData = data.subsets_data[subset];
  const { confusion_matrices } = subsetData;
  const { az_classes, az_colorscale, az_matrix } = confusion_matrices;

  const plotData = [
    {
      z: az_matrix,
      x: az_classes,
      y: az_classes,
      texttemplate: az_classes.length > 10 ? undefined : "%{z}",
      type: "heatmap",
      colorscale: az_colorscale || "viridis",
    },
  ];

  return (
    <Stack>
      <Typography variant="h5">Confusion Matrices</Typography>

      <SelectSubset
        subsets={subsets}
        selected={subset}
        setSelected={setSubset}
      />

      <EvaluationPlot data={plotData} />
    </Stack>
  );
}

function ConfidenceDistributionChart(props) {
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

function MetricPerformanceChart(props) {
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

function SubsetDistributionChart(props) {
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
