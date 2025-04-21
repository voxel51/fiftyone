import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { isNullish } from "@fiftyone/utilities";
import {
  Autorenew,
  DragHandle,
  InsertChartOutlined,
  Percent,
  TableChartOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  ListItemIcon,
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
import React, { useCallback, useEffect, useState } from "react";
import ConfusionMatrixConfig from "../../components/ConfusionMatrixConfig";
import CreateScenario from "../../components/CreateScenario";
import Difference from "../../components/Difference";
import EvaluationSelect from "../../components/EvaluationSelect";
import EvaluationTable from "../../components/EvaluationTable";
import {
  COMPARE_KEY_COLOR,
  COMPARE_KEY_SECONDARY_COLOR,
  COMPARE_KEY_TERTIARY_COLOR,
  KEY_COLOR,
  SECONDARY_KEY_COLOR,
  TERTIARY_KEY_COLOR,
} from "../../constants";
import EvaluationPlot from "../../EvaluationPlot";
import { formatValue, getClasses, getMatrix } from "../../utils";
import Actions from "./Actions";
import Legends from "./Legends";
import { getSubsetDef } from "./utils";
import { atom, useRecoilState } from "recoil";
import LoadingError from "./LoadingError";
import AlertView from "../../../AlertView";

const CONFIGURE_SCENARIO_ACTION = "model_evaluation_configure_scenario";

interface LoadError {
  code: string;
  error: string;
  id: string; // scenario id
}

export const loadScenarioErrorState = atom<LoadError>({
  key: "loadScenarioError",
  default: {
    code: "",
    error: "",
    id: "",
  },
});

export default function Scenarios(props) {
  const {
    evaluation,
    compareEvaluation,
    data,
    loadScenarios,
    loadScenario,
    deleteScenario,
    loadView,
  } = props;
  const { scenarios } = evaluation;
  const [scenario, setScenario] = useState(getDefaultScenario(scenarios));
  const [selectedSubsets, setSelectedSubsets] = useState(["all"]);
  const promptOperator = usePanelEvent();
  const panelId = usePanelId();
  const [mode, setMode] = useState("charts");
  const [differenceMode, setDifferenceMode] = useState("percentage");
  const [loadingScenario, setLoadingScenario] = useState(false);
  const [loading, setLoading] = useState(false);
  const evaluationInfo = evaluation.info;
  const evaluationConfig = evaluationInfo.config;
  const { key, compareKey, id: eval_id } = data?.view;
  const fullScenario = data?.[`scenario_${scenario}_${key}`] || {};
  const subsets = fullScenario?.subsets || [];
  const scenarioChanges = data?.[`scenario_${scenario}_changes`] || [];

  const scenariosArray = scenarios ? Object.values(scenarios) : [];
  const scenariosIds = Object.keys(scenarios);
  const readOnly = !data.permissions?.can_delete_scenario;

  useEffect(() => {
    if (!scenario) {
      setScenario(getDefaultScenario(scenarios));
    }
  }, [scenario, setScenario, scenarios]);

  const onDelete = useCallback(() => {
    setLoading(true);
    deleteScenario(scenario, () => {
      const firstNonDeletedScenario = scenariosIds.find(
        (id) => id !== scenario
      );
      if (firstNonDeletedScenario) {
        setScenario(firstNonDeletedScenario);
      }
      loadScenarios(() => {
        // todo@im: need to find a better way to do this
        setTimeout(() => {
          setLoading(false);
        }, 500);
      });
    });
  }, [deleteScenario, loadScenarios, scenario, scenariosIds]);

  const onEdit = useCallback(() => {
    if (scenario) {
      const fullScenario = scenarios?.[scenario];
      if (!fullScenario) {
        return;
      }
      promptOperator(panelId, {
        params: {
          gt_field: evaluationConfig.gt_field,
          scenario_id: fullScenario.id,
          scenario_type: fullScenario.type,
          scenario_name: fullScenario.name, // this will change as input change
          original_name: fullScenario.name, // this will not change as input change
          scenario_subsets:
            fullScenario.type === "custom_code" ? [] : fullScenario.subsets,
          scenario_subsets_code:
            fullScenario.subsets_code || fullScenario.subsets,
          scenario_field: fullScenario?.field,
          key,
          compare_key: compareKey,
          eval_id,
          scenarioChanges,
        },
        operator: CONFIGURE_SCENARIO_ACTION,
        prompt: true,
        callback: () => {
          setLoadingScenario(true);
          loadScenarios(() => {
            loadScenario(scenario, undefined, () => {
              setTimeout(() => {
                setLoadingScenario(false);
              }, 500);
            });
          });
        },
      });
    }
  }, [
    compareKey,
    eval_id,
    evaluationConfig.gt_field,
    key,
    loadScenario,
    loadScenarios,
    panelId,
    promptOperator,
    scenario,
    scenarios,
    scenarioChanges,
  ]);

  if (loading) {
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

  return (
    <Stack>
      <Stack
        direction="row"
        spacing={1}
        justifyContent="space-between"
        mt={2}
        mb={1}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography color="secondary">Scenario:</Typography>
          <EvaluationSelect
            size="small"
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value as string);
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
          {mode === "tables" && compareKey && (
            <Select
              size="small"
              value={differenceMode}
              onChange={(e) => {
                setDifferenceMode(e.target.value as string);
              }}
              color="secondary"
              renderValue={(value) => {
                return (
                  <Stack>
                    {value === "percentage" ? <Percent /> : <DragHandle />}
                  </Stack>
                );
              }}
            >
              <MenuItem value="ratio" key="ratio">
                <ListItemIcon>
                  <DragHandle />
                </ListItemIcon>
                <Typography>Ratio</Typography>
              </MenuItem>
              <MenuItem value="percentage" key="percentage">
                <ListItemIcon>
                  <Percent />
                </ListItemIcon>
                <Typography>Percentage</Typography>
              </MenuItem>
            </Select>
          )}
          <Select
            size="small"
            value={selectedSubsets}
            onChange={(e) => {
              const values = e.target.value as string[];
              const lastValue = values[values.length - 1];
              if (values.length === 0 || lastValue === "all") {
                setSelectedSubsets(["all"]);
              } else {
                setSelectedSubsets(values.filter((subset) => subset !== "all"));
              }
            }}
            color="secondary"
            multiple
            renderValue={(value) => {
              const valuesLabels = value.map((subset) => {
                if (subset === "all") {
                  return "All";
                }
                return subset;
              });
              return (
                <Typography
                  sx={{
                    maxWidth: 100,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {valuesLabels.join(", ")}
                </Typography>
              );
            }}
          >
            <MenuItem value="all" key="all">
              <Typography>All</Typography>
            </MenuItem>
            {subsets.map((subset) => {
              return (
                <MenuItem value={subset} key={subset}>
                  <Typography>{subset}</Typography>
                </MenuItem>
              );
            })}
          </Select>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(e, mode) => {
              if (mode) {
                setMode(mode);
              }
            }}
            size="small"
          >
            <ToggleButton value="charts">
              <InsertChartOutlined />
            </ToggleButton>
            <ToggleButton value="tables">
              <TableChartOutlined />
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            sx={{ minWidth: "auto", p: "4px 10px" }}
            color="secondary"
            onClick={() => {
              setLoadingScenario(true);
              loadScenario(scenario, undefined, () => {
                setLoadingScenario(false);
              });
            }}
          >
            <Autorenew />
          </Button>
          <CreateScenario
            eval_id={data?.view?.id}
            loadScenarios={loadScenarios}
            gt_field={evaluationConfig.gt_field}
            onAdd={(id) => {
              setScenario(id);
            }}
            evalKey={key}
            compareKey={compareKey}
            readOnly={readOnly}
          />
          <Actions onDelete={onDelete} onEdit={onEdit} readOnly={readOnly} />
        </Stack>
      </Stack>
      {scenario && (
        <Scenario
          key={scenario}
          id={scenario}
          data={data}
          loadScenario={loadScenario}
          mode={mode}
          loading={loadingScenario}
          differenceMode={differenceMode}
          evaluation={evaluation}
          compareEvaluation={compareEvaluation}
          selectedSubsets={selectedSubsets}
          loadView={loadView}
          onDelete={onDelete}
          onEdit={onEdit}
          readOnly={readOnly}
        />
      )}
    </Stack>
  );
}

function Scenario(props) {
  const {
    id,
    data,
    loadScenario,
    mode,
    loading,
    differenceMode,
    selectedSubsets,
    loadView,
    onDelete,
    onEdit,
    readOnly,
  } = props;
  const { key, compareKey } = data?.view;
  let scenario = data?.[`scenario_${id}_${key}`];
  let compareScenario = data?.[`scenario_${id}_${compareKey}`];
  const showAllSubsets =
    selectedSubsets.length === 1 && selectedSubsets[0] === "all";

  const loadError = data?.scenario_load_error;
  const scenarioChanges = data?.[`scenario_${id}_changes`];

  const [{ code: errorCode, error: errorDescription }, setLoadError] =
    useRecoilState(loadScenarioErrorState);

  useEffect(() => {
    if (loadError && loadError.id === id) {
      setLoadError(loadError);
    } else {
      setLoadError({ code: "", error: "", id: "" });
    }
  }, [loadError]);

  useEffect(() => {
    if (!scenario) {
      loadScenario(id);
    }
  }, [id, scenario]);

  useEffect(() => {
    if (compareKey && !compareScenario) {
      loadScenario(id, compareKey);
    }
  }, [compareKey, compareScenario]);

  if (errorCode) {
    return (
      <Stack
        sx={{ minHeight: 300 }}
        alignItems="center"
        justifyContent="center"
      >
        <LoadingError
          code={errorCode}
          description={errorDescription}
          onDelete={onDelete}
          onEdit={onEdit}
          readOnly={readOnly}
        />
      </Stack>
    );
  }

  if (!scenario || loading) {
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

  if (!showAllSubsets) {
    scenario = { ...scenario, subsets: selectedSubsets };
    if (compareScenario) {
      compareScenario = { ...compareScenario, subsets: selectedSubsets };
    }
  }

  return (
    <Stack>
      {scenarioChanges && (
        <AlertView
          schema={{
            view: {
              label: scenarioChanges?.changes?.[0]?.label,
              description: scenarioChanges?.changes?.[0]?.description,
              severity: "warning",
            },
          }}
        />
      )}
      {mode === "charts" ? (
        <ScenarioCharts
          data={data}
          scenario={scenario}
          compareScenario={compareScenario}
          evaluation={props.evaluation}
          compareEvaluation={props.compareEvaluation}
          loadView={loadView}
        />
      ) : (
        <ScenarioTables
          data={data}
          scenario={scenario}
          compareScenario={compareScenario}
          differenceMode={differenceMode}
          loadView={loadView}
        />
      )}
    </Stack>
  );
}

function ScenarioTables(props) {
  return (
    <Stack spacing={2}>
      <PredictionStatisticsTable {...props} />
      <ModelPerformanceMetricsTable {...props} />
      <ConfidenceDistributionTable {...props} />
    </Stack>
  );
}

function PredictionStatisticsTable(props) {
  const { scenario, compareScenario, data, differenceMode } = props;
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
            {compareKey && <TableCell>Difference</TableCell>}
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
                    <Difference
                      value={metrics.tp}
                      compareValue={compareMetrics?.tp}
                      mode="trophy"
                    />
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Typography color="secondary">FP:</Typography>
                    <Typography>{metrics.fp}</Typography>
                    <Difference
                      value={metrics.fp}
                      compareValue={compareMetrics?.fp}
                      mode="trophy"
                      lesserIsBetter
                    />
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Typography color="secondary">FN:</Typography>
                    <Typography>{metrics.fn}</Typography>
                    <Difference
                      value={metrics.fn}
                      compareValue={compareMetrics?.fn}
                      mode="trophy"
                      lesserIsBetter
                    />
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
                        <Difference
                          value={compareMetrics.tp}
                          compareValue={metrics.tp}
                          mode="trophy"
                        />
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Typography color="secondary">FP:</Typography>
                        <Typography>{compareMetrics?.fp}</Typography>
                        <Difference
                          value={compareMetrics.fp}
                          compareValue={metrics.fp}
                          mode="trophy"
                          lesserIsBetter
                        />
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Typography color="secondary">FN:</Typography>
                        <Typography>{compareMetrics.fn}</Typography>
                        <Difference
                          value={compareMetrics.fn}
                          compareValue={metrics.fn}
                          mode="trophy"
                          lesserIsBetter
                        />
                      </Stack>
                    </Stack>
                  ) : (
                    <CircularProgress size={16} />
                  )}
                </TableCell>
              )}
              {compareKey && (
                <TableCell>
                  {compareMetrics ? (
                    <Stack>
                      <Difference
                        value={metrics.tp}
                        compareValue={compareMetrics.tp}
                        mode={differenceMode}
                        arrow
                      />
                      <Difference
                        value={metrics.fp}
                        compareValue={compareMetrics.fp}
                        mode={differenceMode}
                        arrow
                        lesserIsBetter
                      />
                      <Difference
                        value={metrics.fn}
                        compareValue={compareMetrics.fn}
                        mode={differenceMode}
                        arrow
                        lesserIsBetter
                      />
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

  useEffect(() => {
    if (!subsets.includes(selected)) {
      setSelected(subsets[0]);
    }
  }, [selected, setSelected, subsets]);

  return (
    <EvaluationSelect
      size="small"
      value={selected}
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
  const { scenario, compareScenario, data, differenceMode } = props;
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
            {compareKey && <TableCell>Difference</TableCell>}
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
              <TableCell>
                <Stack direction="row" spacing={1}>
                  <Typography>{formatValue(value)} </Typography>
                  <Difference
                    value={value}
                    compareValue={compareMetrics?.[key]}
                    mode="trophy"
                  />
                </Stack>
              </TableCell>
              {compareKey && (
                <TableCell>
                  {compareMetrics ? (
                    <Stack direction="row" spacing={1}>
                      <Typography>
                        {formatValue(compareMetrics[key])}
                      </Typography>
                      <Difference
                        value={compareMetrics[key]}
                        compareValue={value}
                        mode="trophy"
                      />
                    </Stack>
                  ) : (
                    <CircularProgress size={16} />
                  )}
                </TableCell>
              )}
              {compareKey && (
                <TableCell>
                  {compareMetrics ? (
                    <Difference
                      value={value}
                      compareValue={compareMetrics[key]}
                      mode={differenceMode}
                      arrow
                      lesserIsBetter
                    />
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
  const { scenario, compareScenario, data, differenceMode } = props;
  const { key, compareKey } = data?.view;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [metric, setMetric] = useState("avg");
  const metricLabel = CONFIDENCE_DISTRIBUTION_METRICS[metric].label;

  return (
    <Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography>Confidence Distribution</Typography>
        <EvaluationSelect
          size="small"
          defaultValue="avg"
          onChange={(e) => {
            setMetric(e.target.value);
          }}
          ghost
        >
          {CONFIDENCE_DISTRIBUTION_METRICS_VALUES.map(({ key, label }) => {
            return (
              <MenuItem value={key} key={key}>
                <Typography>{label}</Typography>
              </MenuItem>
            );
          })}
        </EvaluationSelect>
      </Stack>
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
            {compareKey && <TableCell>Difference ({metricLabel})</TableCell>}
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
                <Stack direction="row" spacing={1}>
                  <Typography>
                    {formatValue(confidence_distribution[metric])}
                  </Typography>
                  <Difference
                    value={confidence_distribution[metric]}
                    compareValue={compareConfidenceDistribution?.[metric]}
                    mode="trophy"
                  />
                </Stack>
              </TableCell>
              {compareKey && (
                <TableCell>
                  {compareSubsetsData ? (
                    <Stack direction="row" spacing={1}>
                      <Typography>
                        {formatValue(compareConfidenceDistribution[metric])}
                      </Typography>
                      <Difference
                        value={compareConfidenceDistribution[metric]}
                        compareValue={confidence_distribution[metric]}
                        mode="trophy"
                      />
                    </Stack>
                  ) : (
                    <CircularProgress size={16} />
                  )}
                </TableCell>
              )}
              {compareKey && (
                <TableCell>
                  {compareSubsetsData ? (
                    <Difference
                      value={confidence_distribution[metric]}
                      compareValue={compareConfidenceDistribution[metric]}
                      mode={differenceMode}
                      arrow
                      lesserIsBetter
                    />
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

function PredictionStatisticsChart(props) {
  const { scenario, compareScenario, loadView } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [metric, setMetric] = useState("all");
  const showAllMetric = metric === "all";
  const { key, compareKey } = props.data?.view || {};

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
      name: `${key} True Positives`,
      id: "tp",
      type: "bar",
      offsetgroup: 0,
      marker: { color: KEY_COLOR },
    };

    const fpTrace = {
      x: subsets,
      y: fp,
      name: `${key} False Positives`,
      id: "fp",
      type: "bar",
      offsetgroup: 0,
      marker: { color: SECONDARY_KEY_COLOR },
    };
    const fnTrace = {
      x: subsets,
      y: fn,
      name: `${key} False Negatives`,
      id: "fn",
      type: "bar",
      offsetgroup: 0,
      marker: { color: TERTIARY_KEY_COLOR },
    };

    const compareTPTrace = {
      x: subsets,
      y: compareTP,
      name: `${compareKey} True Positives`,
      id: "tp",
      isCompare: true,
      type: "bar",
      offsetgroup: 1,
      marker: { color: COMPARE_KEY_COLOR },
    };

    const compareFPTrace = {
      x: subsets,
      y: compareFP,
      name: `${compareKey} False Positives`,
      id: "fp",
      isCompare: true,
      type: "bar",
      offsetgroup: 1,
      marker: { color: COMPARE_KEY_SECONDARY_COLOR },
    };

    const compareFNTrace = {
      x: subsets,
      y: compareFN,
      name: `${compareKey} False Negatives`,
      id: "fn",
      isCompare: true,
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
    plotData = [
      {
        x: subsets,
        y: main,
        type: "bar",
        name: key,
        marker: {
          color: KEY_COLOR,
        },
      },
    ];
    if (compareSubsetsData) {
      plotData.push({
        x: subsets,
        y: compare,
        type: "bar",
        name: compareKey,
        marker: { color: COMPARE_KEY_COLOR },
      });
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
        onClick={({ points }) => {
          const firstPoint = points[0];
          const { id, isCompare } = firstPoint.data;
          const subset = firstPoint.x;
          const subsetDef = getSubsetDef(scenario, subset);
          loadView("field", { field: id, subset_def: subsetDef });
        }}
      />
      <Legends prediction={showAllMetric} {...getLegendProps(props)} />
    </Stack>
  );
}

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
      marker: { color: KEY_COLOR },
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
      marker: { color: COMPARE_KEY_COLOR },
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
      <Legends {...getLegendProps(props)} />
    </Stack>
  );
}

function ConfusionMatrixChart(props) {
  const { scenario, compareScenario, loadView } = props;
  const { subsets } = scenario;
  const [subset, setSubset] = useState(subsets[0]);
  const subsetData = scenario.subsets_data[subset];
  const compareSubsetData = compareScenario?.subsets_data[subset];
  const [config, setConfig] = useState({ log: true });
  const evaluationMaskTargets = props.evaluation?.mask_targets || {};
  const compareEvaluationMaskTargets =
    props.compareEvaluation?.mask_targets || {};
  const matrices = subsetData?.confusion_matrices;
  const matrixData = getMatrix(
    matrices,
    config,
    evaluationMaskTargets,
    undefined,
    true
  );
  const matrixPlotData = matrixData?.plot;
  const plotData = [matrixPlotData];
  const comparePlotData = compareScenario
    ? [
        getMatrix(
          compareSubsetData?.confusion_matrices,
          config,
          evaluationMaskTargets,
          compareEvaluationMaskTargets,
          true
        )?.plot,
      ]
    : undefined;
  const classes = getClasses(matrices, evaluationMaskTargets);

  return (
    <Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography>Confusion Matrices</Typography>

        <Stack direction="row" spacing={1}>
          <SelectSubset
            subsets={subsets}
            selected={subset}
            setSelected={setSubset}
          />
          <ConfusionMatrixConfig
            config={config}
            onSave={setConfig}
            classes={classes}
          />
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1}>
        <Stack sx={{ width: comparePlotData ? "50%" : "100%" }}>
          <EvaluationPlot
            data={plotData}
            onClick={({ points }) => {
              const firstPoint = points[0];
              const subsetDef = getSubsetDef(scenario, subset);
              loadView("matrix", {
                x: firstPoint.x,
                y: firstPoint.y,
                subset_def: subsetDef,
              });
            }}
          />
        </Stack>
        {comparePlotData && (
          <Stack sx={{ width: "50%" }}>
            <EvaluationPlot data={comparePlotData} />
          </Stack>
        )}
      </Stack>
      <Legends {...getLegendProps(props)} />
    </Stack>
  );
}

function ConfidenceDistributionChart(props) {
  const { scenario, compareScenario } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const { key, compareKey } = props.data?.view;
  const [mode, setMode] = useState("overview");
  const isOverview = mode === "overview";

  const plotData = [];

  if (!isOverview) {
    const y = [];
    for (const subset in subsets_data) {
      const subsetData = subsets_data[subset];
      const { confidence_distribution } = subsetData;
      y.push(confidence_distribution[mode]);
    }
    plotData.push({ x: subsets, y, type: "bar", name: key });
    if (compareSubsetsData) {
      const compareY = [];
      for (const subset in compareSubsetsData) {
        const subsetData = compareSubsetsData[subset];
        const { confidence_distribution } = subsetData;
        compareY.push(confidence_distribution[mode]);
      }
      plotData.push({ x: subsets, y: compareY, type: "bar", name: compareKey });
    }
  } else {
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
        const compareSubsetX = new Array(compareConfidences.length).fill(
          subset
        );
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
  }

  return (
    <Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography>Confidence Distribution</Typography>
        <EvaluationSelect
          size="small"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
          }}
          ghost
        >
          <MenuItem value={"overview"} key={"overview"}>
            <Typography>Overview</Typography>
          </MenuItem>
          {CONFIDENCE_DISTRIBUTION_METRICS_VALUES.map(({ key, label }) => {
            return (
              <MenuItem value={key} key={key}>
                <Typography>{label}</Typography>
              </MenuItem>
            );
          })}
        </EvaluationSelect>
      </Stack>

      <EvaluationPlot
        data={plotData}
        layout={compareSubsetsData ? { boxmode: "group" } : {}}
      />

      <Legends {...getLegendProps(props)} />
    </Stack>
  );
}

function MetricPerformanceChart(props) {
  const { scenario, compareScenario, loadView } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [metric, setMetric] = useState("average_confidence");
  const { key, compareKey } = props.data?.view;

  const y = subsets.map((subset) => {
    const subsetData = subsets_data[subset];
    return subsetData.metrics[metric];
  });

  const plotData = [
    { x: subsets, y, type: "bar", name: key, marker: { color: KEY_COLOR } },
  ];
  if (compareSubsetsData) {
    const compareY = subsets.map((subset) => {
      const subsetData = compareSubsetsData[subset];
      return subsetData.metrics[metric];
    });
    plotData.push({
      x: subsets,
      y: compareY,
      type: "bar",
      name: compareKey,
      marker: { color: COMPARE_KEY_COLOR },
    });
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
      <EvaluationPlot
        data={plotData}
        onClick={({ points }) => {
          const subset = points[0]?.x;
          const subsetDef = getSubsetDef(scenario, subset);
          if (!subsetDef) return;
          return loadView("subset", { subset_def: subsetDef });
        }}
      />
      <Legends {...getLegendProps(props)} />
    </Stack>
  );
}

function SubsetDistributionChart(props) {
  const { scenario, compareScenario, loadView } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const { key, compareKey } = props.data?.view;

  const y = subsets.map((subset) => {
    const subsetData = subsets_data[subset];
    return subsetData.distribution;
  });

  const plotData = [
    { x: subsets, y, type: "bar", name: key, marker: { color: KEY_COLOR } },
  ];
  if (compareSubsetsData) {
    const compareY = subsets.map((subset) => {
      const subsetData = compareSubsetsData[subset];
      return subsetData.distribution;
    });
    plotData.push({
      x: subsets,
      y: compareY,
      type: "bar",
      name: compareKey,
      marker: { color: COMPARE_KEY_COLOR },
    });
  }

  return (
    <Stack>
      <Typography>Subset Distribution</Typography>
      <EvaluationPlot
        data={plotData}
        onClick={({ points }) => {
          const subset = points[0]?.x;
          const subsetDef = getSubsetDef(scenario, subset);
          if (!subsetDef) return;
          return loadView("subset", { subset_def: subsetDef });
        }}
      />
      <Legends {...getLegendProps(props)} />
    </Stack>
  );
}

function getDefaultScenario(scenarios) {
  if (!scenarios) return null;
  const scenarioIds = Object.keys(scenarios);
  if (scenarioIds.length === 0) return null;
  return scenarioIds[0];
}

function getLegendProps(props) {
  const { key, compareKey } = props.data?.view || {};
  return { primaryKey: key, compareKey };
}
