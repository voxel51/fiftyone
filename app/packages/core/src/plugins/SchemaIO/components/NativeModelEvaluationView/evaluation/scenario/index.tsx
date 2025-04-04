import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { isNullish } from "@fiftyone/utilities";
import {
  Add,
  InsertChartOutlined,
  TableChartOutlined,
} from "@mui/icons-material";
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
import EvaluationSelect from "../../components/EvaluationSelect";
import EvaluationTable from "../../components/EvaluationTable";
import EvaluationPlot from "../../EvaluationPlot";
import { scenarioCardStyles } from "../../styles";
import { formatValue } from "../../utils";
import EmptyScenario from "./EmptyScenario";
import {
  COMPARE_KEY_COLOR,
  COMPARE_KEY_SECONDARY_COLOR,
  COMPARE_KEY_TERTIARY_COLOR,
  KEY_COLOR,
  SECONDARY_KEY_COLOR,
  TERTIARY_KEY_COLOR,
} from "../../constants";

const CONFIGURE_SCENARIO_ACTION = "model_evaluation_configure_scenario";

export default function EvaluationScenarioAnalysis(props) {
  const { evaluation, data, loadScenario } = props;
  const { scenarios } = evaluation;
  const [selectedScenario, setSelectedScenario] = useState(
    getDefaultScenario(scenarios)
  );
  const [mode, setMode] = useState("charts");
  const panelId = usePanelId();
  const promptOperator = usePanelEvent();
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
        <EmptyScenario
          evaluationConfig={evaluationConfig}
          onCreateScenario={() => {}}
        />
      ) : (
        <Stack direction="row" spacing={1} justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography>Scenario:</Typography>
            <EvaluationSelect
              size="small"
              defaultValue={selectedScenario}
              onChange={(e) => {
                setSelectedScenario(e.target.value as string);
              }}
              ghost
            >
              {scenariosArray.map((scenario) => {
                const { id, name } = scenario;
                return (
                  <MenuItem value={id} key={id}>
                    <Typography>{name}</Typography>
                  </MenuItem>
                );
              })}
            </EvaluationSelect>
          </Stack>
          <Stack direction="row" spacing={1}>
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
            <Button
              size="small"
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
              <Add />
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
          mode={mode}
        />
      )}
    </Card>
  );
}

function Scenario(props) {
  const { id, data, loadScenario, mode } = props;
  const { key, compareKey } = data?.view;
  const scenario = data?.[`scenario_${id}_${key}`];
  const compareScenario = data?.[`scenario_${id}_${compareKey}`];

  useEffect(() => {
    if (!scenario) {
      loadScenario(id);
    }
  }, [scenario]);

  useEffect(() => {
    if (compareKey && !compareScenario) {
      loadScenario(id, compareKey);
    }
  }, [compareKey, compareScenario]);

  if (!scenario) {
    return <CircularProgress />;
  }

  return (
    <Stack>
      {mode === "charts" ? (
        <ScenarioCharts
          data={data}
          scenario={scenario}
          compareScenario={compareScenario}
        />
      ) : (
        <ScenarioTable
          data={data}
          scenario={scenario}
          compareScenario={compareScenario}
        />
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
  const { scenario, compareScenario, data } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const { key, compareKey } = data?.view;

  return (
    <Stack>
      <Typography variant="h5">Prediction Statistics</Typography>
      <EvaluationTable variant="card" size="medium">
        <TableHead>
          <TableRow>
            <TableCell>Subset</TableCell>
            <TableCell>{key}</TableCell>
            {compareKey && <TableCell>{compareKey}</TableCell>}
          </TableRow>
        </TableHead>
        {subsets.map((subset) => {
          const subsetData = subsets_data[subset];
          const compareSubsetData = compareSubsetsData?.[subset];
          const { metrics } = subsetData;
          const compareMetrics = compareSubsetData?.metrics;
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
              {compareKey && (
                <TableCell>
                  {compareMetrics ? (
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1}>
                        <Typography color="secondary">TP:</Typography>
                        <Typography>{compareMetrics?.tp}</Typography>
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Typography color="secondary">FP:</Typography>
                        <Typography>{compareMetrics?.fp}</Typography>
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Typography color="secondary">FN:</Typography>
                        <Typography>{compareMetrics.fn}</Typography>
                      </Stack>
                    </Stack>
                  ) : (
                    <CircularProgress size={16} />
                  )}
                </TableCell>
              )}
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
  const { scenario, compareScenario, data } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [subset, setSubset] = useState(subsets[0]);
  const { key, compareKey } = data?.view;

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
            <TableCell>{key}</TableCell>
            {compareKey && <TableCell>{compareKey}</TableCell>}
          </TableRow>
        </TableHead>
        {MODEL_PERFORMANCE_METRICS.map(({ label, key }) => {
          const subsetData = subsets_data[subset];
          const compareSubsetData = compareSubsetsData?.[subset];
          const { metrics } = subsetData;
          const compareMetrics = compareSubsetData?.metrics;
          const value = metrics[key];
          return (
            <TableRow key={key}>
              <TableCell>{label}</TableCell>
              <TableCell>{formatValue(value)}</TableCell>
              {compareKey && (
                <TableCell>
                  {compareMetrics ? (
                    formatValue(compareMetrics[key])
                  ) : (
                    <CircularProgress size={16} />
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </EvaluationTable>
    </Stack>
  );
}

const CONFIDENCE_DISTRIBUTION_METRICS = {
  avg: { label: "Average", key: "avg" },
  median: { label: "Median", key: "median" },
  min: { label: "Minimum", key: "min" },
  max: { label: "Maximum", key: "max" },
  std: { label: "Standard Deviation", key: "std" },
};
const CONFIDENCE_DISTRIBUTION_METRICS_VALUES = Object.values(
  CONFIDENCE_DISTRIBUTION_METRICS
);

function ConfidenceDistributionTable(props) {
  const { scenario, compareScenario, data } = props;
  const { key, compareKey } = data?.view;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [metric, setMetric] = useState("avg");
  const metricLabel = CONFIDENCE_DISTRIBUTION_METRICS[metric].label;

  return (
    <Stack>
      <Typography variant="h5">Confidence Distribution</Typography>
      <Select
        size="small"
        defaultValue="avg"
        onChange={(e) => {
          setMetric(e.target.value);
        }}
      >
        {CONFIDENCE_DISTRIBUTION_METRICS_VALUES.map(({ key, label }) => {
          return (
            <MenuItem value={key} key={key}>
              <Typography>{label}</Typography>
            </MenuItem>
          );
        })}
      </Select>
      <EvaluationTable variant="card" size="medium">
        <TableHead>
          <TableRow>
            <TableCell>Subset</TableCell>
            <TableCell>
              {key} ({metricLabel})
            </TableCell>
            {compareKey && (
              <TableCell>
                {compareKey} ({metricLabel})
              </TableCell>
            )}
          </TableRow>
        </TableHead>
        {subsets.map((subset) => {
          const subsetData = subsets_data[subset];
          const compareSubsetData = compareSubsetsData?.[subset];
          const { confidence_distribution } = subsetData;
          const compareConfidenceDistribution =
            compareSubsetData?.confidence_distribution;
          return (
            <TableRow key={subset}>
              <TableCell>{subset}</TableCell>
              <TableCell>
                {formatValue(confidence_distribution[metric])}
              </TableCell>
              {compareKey && (
                <TableCell>
                  {compareSubsetsData ? (
                    formatValue(compareConfidenceDistribution[metric])
                  ) : (
                    <CircularProgress size={16} />
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </EvaluationTable>
    </Stack>
  );
}

function ScenarioCharts(props) {
  return (
    <Stack>
      <PredictionStatisticsChart {...props} />
      <ScenarioModelPerformanceChart {...props} />
      <ConfusionMatrixChart {...props} />
      <ConfidenceDistributionChart {...props} />
      <MetricPerformanceChart {...props} />
      <SubsetDistributionChart {...props} />
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

function ScenarioModelPerformanceChart(props) {
  const { scenario, compareScenario } = props;
  const { subsets } = scenario;
  const [subset, setSubset] = useState(subsets[0]);
  const subsetData = scenario.subsets_data[subset];
  const compareSubsetData = compareScenario?.subsets_data[subset];
  const { metrics } = subsetData;
  const compareMetrics = compareSubsetData?.metrics;
  const { key, compareKey } = props.data?.view;

  const theta = [];
  const r = [];
  for (const metric of MODEL_PERFORMANCE_METRICS) {
    const { label, key } = metric;
    const value = metrics[key];
    if (isNullish(value)) continue;
    theta.push(label);
    r.push(value);
  }
  const plotData = [
    {
      type: "scatterpolar",
      r,
      theta,
      fill: "toself",
      name: key,
    },
  ];

  if (compareMetrics) {
    const compareTheta = [];
    const compareR = [];
    for (const metric of MODEL_PERFORMANCE_METRICS) {
      const { label, key } = metric;
      const value = compareMetrics[key];
      if (isNullish(value)) continue;
      compareTheta.push(label);
      compareR.push(value);
    }
    plotData.push({
      type: "scatterpolar",
      r: compareR,
      theta: compareTheta,
      fill: "toself",
      name: compareKey,
    });
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
        data={plotData}
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
  const { scenario, compareScenario } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;

  const tp: number[] = [];
  const fp: number[] = [];
  const fn: number[] = [];
  const compareTP: number[] = [];
  const compareFP: number[] = [];
  const compareFN: number[] = [];

  for (const subset of subsets) {
    const metrics = subsets_data[subset].metrics;
    const compareMetrics = compareSubsetsData?.[subset]?.metrics;
    tp.push(metrics.tp);
    fp.push(metrics.fp);
    fn.push(metrics.fn);
    if (compareMetrics) {
      compareTP.push(compareMetrics.tp);
      compareFP.push(compareMetrics.fp);
      compareFN.push(compareMetrics.fn);
    }
  }

  const tpTrace = {
    x: subsets,
    y: tp,
    name: "TP",
    type: "bar",
    offsetgroup: 0,
    marker: { color: KEY_COLOR },
  };

  const fpTrace = {
    x: subsets,
    y: fp,
    name: "FP",
    type: "bar",
    offsetgroup: 0,
    marker: { color: SECONDARY_KEY_COLOR },
  };
  const fnTrace = {
    x: subsets,
    y: fn,
    name: "FN",
    type: "bar",
    offsetgroup: 0,
    marker: { color: TERTIARY_KEY_COLOR },
  };

  const compareTPTrace = {
    x: subsets,
    y: compareTP,
    name: "Compare TP",
    type: "bar",
    offsetgroup: 1,
    marker: { color: COMPARE_KEY_COLOR },
  };

  const compareFPTrace = {
    x: subsets,
    y: compareFP,
    name: "Compare FP",
    type: "bar",
    offsetgroup: 1,
    marker: { color: COMPARE_KEY_SECONDARY_COLOR },
  };

  const compareFNTrace = {
    x: subsets,
    y: compareFN,
    name: "Compare FN",
    type: "bar",
    offsetgroup: 1,
    marker: { color: COMPARE_KEY_TERTIARY_COLOR },
  };
  const plotData = [tpTrace, fpTrace, fnTrace];
  if (compareSubsetsData) {
    plotData.push(compareTPTrace, compareFPTrace, compareFNTrace);
  }

  return (
    <Stack>
      <Typography variant="h5">Prediction Statistics</Typography>

      <EvaluationPlot data={plotData} layout={{ barmode: "stack" }} />
    </Stack>
  );
}

function ConfusionMatrixChart(props) {
  const { scenario, compareScenario } = props;
  const { subsets } = scenario;
  const [subset, setSubset] = useState(subsets[0]);
  const subsetData = scenario.subsets_data[subset];
  const compareSubsetData = compareScenario?.subsets_data[subset];
  const { confusion_matrices } = subsetData;
  const compareConfusionMatrices = compareSubsetData?.confusion_matrices;
  const { az_classes, az_colorscale, az_matrix } = confusion_matrices;
  const compareAzMatrix = compareConfusionMatrices?.az_matrix;
  const compareAzClasses = compareConfusionMatrices?.az_classes;
  const compareAzColorscale = compareConfusionMatrices?.az_colorscale;

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
  const comparePlotData = compareScenario
    ? [
        {
          z: compareAzMatrix,
          x: compareAzClasses,
          y: compareAzClasses,
          texttemplate: compareAzClasses.length > 10 ? undefined : "%{z}",
          type: "heatmap",
          colorscale: compareAzColorscale || "viridis",
        },
      ]
    : undefined;

  return (
    <Stack>
      <Typography variant="h5">Confusion Matrices</Typography>

      <SelectSubset
        subsets={subsets}
        selected={subset}
        setSelected={setSubset}
      />

      <Stack direction="row" spacing={1}>
        <Stack sx={{ width: "50%" }}>
          <EvaluationPlot data={plotData} />
        </Stack>
        {comparePlotData && (
          <Stack sx={{ width: "50%" }}>
            <EvaluationPlot data={comparePlotData} />
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

function ConfidenceDistributionChart(props) {
  const { scenario, compareScenario } = props;
  const { subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const { key, compareKey } = props.data?.view;

  const plotData = [];

  if (compareSubsetsData) {
    const x = [];
    const y = [];
    const compareX = [];
    const compareY = [];
    for (const subset in subsets_data) {
      const subsetData = subsets_data[subset];
      const compareSubsetData = compareSubsetsData[subset];
      const { confidences } = subsetData;
      const compareConfidences = compareSubsetData.confidences;
      const subsetX = new Array(confidences.length).fill(subset);
      const compareSubsetX = new Array(compareConfidences.length).fill(subset);
      x.push(...subsetX);
      y.push(...confidences);
      compareX.push(...compareSubsetX);
      compareY.push(...compareConfidences);
    }
    const subsetA = {
      y,
      x,
      name: key,
      marker: { color: KEY_COLOR },
      type: "box",
    };
    const subsetB = {
      y: compareY,
      x: compareX,
      name: compareKey,
      marker: { color: COMPARE_KEY_COLOR },
      type: "box",
    };
    plotData.push(subsetA, subsetB);
  } else {
    for (const subset in subsets_data) {
      const subsetData = subsets_data[subset];
      plotData.push({
        y: subsetData.confidences,
        name: subset,
        type: "box",
        marker: { color: KEY_COLOR },
      });
    }
  }

  return (
    <Stack>
      <Typography variant="h5">Confidence Distribution</Typography>

      <EvaluationPlot
        data={plotData}
        layout={compareSubsetsData ? { boxmode: "group" } : {}}
      />
    </Stack>
  );
}

function MetricPerformanceChart(props) {
  const { scenario, compareScenario } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [metric, setMetric] = useState("average_confidence");
  const { key, compareKey } = props.data?.view;

  const y = subsets.map((subset) => {
    const subsetData = subsets_data[subset];
    return subsetData.metrics[metric];
  });

  const plotData = [{ x: subsets, y, type: "bar", name: key }];
  if (compareSubsetsData) {
    const compareY = subsets.map((subset) => {
      const subsetData = compareSubsetsData[subset];
      return subsetData.metrics[metric];
    });
    plotData.push({ x: subsets, y: compareY, type: "bar", name: compareKey });
  }

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
  const { scenario, compareScenario } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const { key, compareKey } = props.data?.view;

  const y = subsets.map((subset) => {
    const subsetData = subsets_data[subset];
    return subsetData.distribution;
  });

  const plotData = [{ x: subsets, y, type: "bar", name: key }];
  if (compareSubsetsData) {
    const compareY = subsets.map((subset) => {
      const subsetData = compareSubsetsData[subset];
      return subsetData.distribution;
    });
    plotData.push({ x: subsets, y: compareY, type: "bar", name: compareKey });
  }

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
