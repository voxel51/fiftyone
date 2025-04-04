import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { isNullish } from "@fiftyone/utilities";
import {
  Add,
  InsertChartOutlined,
  TableChartOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CircularProgress,
  Grid,
  MenuItem,
  Select,
  Stack,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
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
  const { evaluation, data, loadScenarios, loadScenario } = props;
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
          onCreateScenario={() => {
            loadScenarios();
          }}
        />
      ) : (
        <Stack direction="row" spacing={1} justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography color="secondary">Scenario:</Typography>
            <EvaluationSelect
              size="small"
              defaultValue={selectedScenario}
              onChange={(e) => {
                setSelectedScenario(e.target.value as string);
              }}
              color="secondary"
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
                    scenario_type: "custom_code",
                    scenario_name: "test", // # TODO: Edit will pass current name
                  },
                  operator: CONFIGURE_SCENARIO_ACTION,
                  prompt: true,
                  callback: loadScenarios,
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
    return (
      <Stack
        sx={{ minHeight: 300 }}
        alignItems="center"
        justifyContent="center"
      >
        <CircularProgress size={24} />
      </Stack>
    );
  }

  if (!scenario.subsets_data) {
    return (
      <Stack
        sx={{ minHeight: 300 }}
        alignItems="center"
        justifyContent="center"
      >
        <Typography>Scenario is unsupported or is invalid</Typography>
      </Stack>
    );
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
      <Typography>Prediction Statistics</Typography>
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
    <EvaluationSelect
      size="small"
      defaultValue={selected}
      onChange={(e) => {
        setSelected(e.target.value);
      }}
      ghost
    >
      {subsets.map((subset) => {
        return (
          <MenuItem value={subset} key={subset}>
            <Typography>{subset}</Typography>
          </MenuItem>
        );
      })}
    </EvaluationSelect>
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
      <Stack direction="row" justifyContent="space-between">
        <Typography>Model Performance</Typography>
        <SelectSubset
          subsets={subsets}
          selected={subset}
          setSelected={setSubset}
        />
      </Stack>
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
      <Typography>Confidence Distribution</Typography>
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

function ScenarioChartCard(props) {
  const { children } = props;
  const theme = useTheme();

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 1,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      {children}
    </Box>
  );
}

function ScenarioCharts(props) {
  return (
    <Grid container spacing={2} pt={2}>
      <Grid item xs={6}>
        <ScenarioChartCard>
          <PredictionStatisticsChart {...props} />
        </ScenarioChartCard>
      </Grid>
      <Grid item xs={6}>
        <ScenarioChartCard>
          <ScenarioModelPerformanceChart {...props} />
        </ScenarioChartCard>
      </Grid>
      <Grid item xs={12}>
        <ScenarioChartCard>
          <ConfusionMatrixChart {...props} />
        </ScenarioChartCard>
      </Grid>
      <Grid item xs={6}>
        <ScenarioChartCard>
          <ConfidenceDistributionChart {...props} />
        </ScenarioChartCard>
      </Grid>
      <Grid item xs={6}>
        <ScenarioChartCard>
          <MetricPerformanceChart {...props} />
        </ScenarioChartCard>
      </Grid>
      <Grid item xs={12}>
        <ScenarioChartCard>
          <SubsetDistributionChart {...props} />
        </ScenarioChartCard>
      </Grid>
    </Grid>
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
      <Stack direction="row" justifyContent="space-between">
        <Typography>Model Performance</Typography>
        <SelectSubset
          subsets={subsets}
          selected={subset}
          setSelected={setSubset}
        />
      </Stack>
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
  const [metric, setMetric] = useState("all");
  const showAllMetric = metric === "all";

  let plotData = new Array<unknown>();

  const tp: number[] = [];
  const fp: number[] = [];
  const fn: number[] = [];
  const compareTP: number[] = [];
  const compareFP: number[] = [];
  const compareFN: number[] = [];
  const metricsByMode = {
    tp: { main: tp, compare: compareTP },
    fp: { main: fp, compare: compareFP },
    fn: { main: fn, compare: compareFN },
  };

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

  if (showAllMetric) {
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
    plotData = [tpTrace, fpTrace, fnTrace];
    if (compareSubsetsData) {
      plotData.push(compareTPTrace, compareFPTrace, compareFNTrace);
    }
  } else {
    const metricsForMode = metricsByMode[metric];
    const { main, compare } = metricsForMode;
    plotData = [{ x: subsets, y: main, type: "bar", name: "x" }];
    if (compareSubsetsData) {
      plotData.push({ x: subsets, y: compare, type: "bar", name: "x" });
    }
  }

  return (
    <Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography>Prediction Statistics</Typography>
        <EvaluationSelect
          size="small"
          value={metric}
          onChange={(e) => {
            setMetric(e.target.value);
          }}
          ghost
        >
          <MenuItem value={"all"} key={"all"}>
            <Typography>All</Typography>
          </MenuItem>
          <MenuItem value={"tp"} key={"tp"}>
            <Typography>True Positives</Typography>
          </MenuItem>
          <MenuItem value={"fp"} key={"fp"}>
            <Typography>False Positives</Typography>
          </MenuItem>
          <MenuItem value={"fn"} key={"fn"}>
            <Typography>False Negatives</Typography>
          </MenuItem>
        </EvaluationSelect>
      </Stack>

      <EvaluationPlot
        data={plotData}
        layout={showAllMetric ? { barmode: "stack" } : {}}
      />
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
      <Stack direction="row" justifyContent="space-between">
        <Typography>Confusion Matrices</Typography>

        <SelectSubset
          subsets={subsets}
          selected={subset}
          setSelected={setSubset}
        />
      </Stack>

      <Stack direction="row" spacing={1}>
        <Stack sx={{ width: comparePlotData ? "50%" : "100%" }}>
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
      <Typography>Confidence Distribution</Typography>

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
      <Stack direction="row" justifyContent="space-between">
        <Typography>Metric Performance</Typography>
        <EvaluationSelect
          size="small"
          defaultValue={metric}
          onChange={(e) => {
            setMetric(e.target.value);
          }}
          ghost
        >
          {MODEL_PERFORMANCE_METRICS.map(({ key, label }) => {
            return (
              <MenuItem value={key} key={key}>
                <Typography>{label}</Typography>
              </MenuItem>
            );
          })}
        </EvaluationSelect>
      </Stack>
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
      <Typography>Subset Distribution</Typography>
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
