import { useTrackEvent } from "@fiftyone/analytics";
import { Plot } from "@fiftyone/components/src/components/Plot";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId, usePanelStatePartial } from "@fiftyone/spaces";
import { formatValueAsNumber, isNullish } from "@fiftyone/utilities";
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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { atom, useRecoilState } from "recoil";
import AlertView from "../../../AlertView";
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
import { getClasses, getMatrix } from "../../utils";
import Actions from "./Actions";
import Legends from "./Legends";
import LoadingError from "./LoadingError";
import { getSubsetDef } from "./utils";

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
  const { scenarios } = data;
  const promptOperator = usePanelEvent();
  const panelId = usePanelId();
  const [loadingScenario, setLoadingScenario] = useState(false);
  const [loading, setLoading] = useState(false);
  const evaluationInfo = evaluation.info;
  const evaluationConfig = evaluationInfo.config;
  const { key, compareKey, id: eval_id } = data?.view;
  const trackEvent = useTrackEvent();
  const [scenario, setScenario] = usePanelStatePartial(
    `${key}_scenario`,
    getDefaultScenario(scenarios)
  );
  const [mode, setMode] = usePanelStatePartial(
    `${key}_scenario_mode`,
    "charts"
  );
  const [selectedSubsets, setSelectedSubsets] = usePanelStatePartial(
    `${key}_scenario_subsets`,
    ["all"]
  );
  const [differenceMode, setDifferenceMode] = usePanelStatePartial(
    `${key}_scenario_difference_mode`,
    "percentage"
  );

  const updateScenario = useCallback(
    (scenarioId: string) => {
      setScenario(scenarioId);
      setSelectedSubsets(["all"]);
    },
    [setScenario, setSelectedSubsets]
  );

  const fullScenario = data?.[`scenario_${scenario}_${key}`] || {};
  const subsets = fullScenario?.subsets || [];
  const scenarioChanges = useMemo(
    () => data?.[`scenario_${scenario}_changes`] || [],
    [data, scenario]
  );
  const scenariosArray = scenarios ? Object.values(scenarios) : [];
  const scenariosIds = Object.keys(scenarios);
  const readOnly = !data.permissions?.can_delete_scenario;
  const canCreate = data.permissions?.can_create_scenario;
  const canEdit = data.permissions?.can_edit_scenario;
  const canDelete = data.permissions?.can_delete_scenario;

  useEffect(() => {
    if (!scenario) {
      updateScenario(getDefaultScenario(scenarios));
    }
  }, [scenario, updateScenario, scenarios]);

  const onDelete = useCallback(() => {
    setLoading(true);
    trackEvent("delete_scenario_click", {
      eval_id,
      scenario_id: scenario,
    });
    deleteScenario(scenario, () => {
      const firstNonDeletedScenario = scenariosIds.find(
        (id) => id !== scenario
      );
      if (firstNonDeletedScenario) {
        updateScenario(firstNonDeletedScenario);
      }
      loadScenarios(() => {
        // todo@im: need to find a better way to do this
        setTimeout(() => {
          setLoading(false);
        }, 500);
      });
    });
  }, [
    deleteScenario,
    eval_id,
    loadScenarios,
    scenario,
    scenariosIds,
    trackEvent,
    updateScenario,
  ]);

  const onEdit = useCallback(() => {
    if (scenario) {
      const fullScenario = scenarios?.[scenario];
      if (!fullScenario) {
        return;
      }
      trackEvent("edit_scenario_modal_open", {
        eval_id,
        scenario_id: fullScenario.id,
        scenario_type: fullScenario.type,
        scenario_name: fullScenario.name,
        scenario_subsets: fullScenario.subsets,
      });
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
    scenario,
    scenarios,
    trackEvent,
    eval_id,
    promptOperator,
    panelId,
    evaluationConfig.gt_field,
    key,
    compareKey,
    scenarioChanges,
    loadScenarios,
    loadScenario,
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
              updateScenario(e.target.value as string);
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
              <MenuItem value="numeric" key="numeric">
                <ListItemIcon>
                  <DragHandle />
                </ListItemIcon>
                <Typography>Count</Typography>
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
              loadScenario(
                scenario,
                undefined,
                () => {
                  setLoadingScenario(false);
                },
                true
              );
            }}
          >
            <Autorenew />
          </Button>
          <CreateScenario
            eval_id={data?.view?.id}
            loadScenarios={loadScenarios}
            gt_field={evaluationConfig.gt_field}
            onAdd={(id) => {
              updateScenario(id);
            }}
            evalKey={key}
            compareKey={compareKey}
            canCreate={canCreate}
          />
          <Actions
            onDelete={onDelete}
            onEdit={onEdit}
            canEdit={canEdit}
            canDelete={canDelete}
          />
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
          trackEvent={trackEvent}
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
    trackEvent,
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
          trackEvent={trackEvent}
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
  const width = getWidth(props);

  return (
    <Stack>
      <Typography>Prediction Statistics</Typography>
      <EvaluationTable variant="card" size="medium">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width }}>Subset</TableCell>
            <TableCell sx={{ width }}>{key}</TableCell>
            {compareKey && <TableCell sx={{ width }}>{compareKey}</TableCell>}
            {compareKey && <TableCell sx={{ width }}>Difference</TableCell>}
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
                      />
                      <Difference
                        value={metrics.fn}
                        compareValue={compareMetrics.fn}
                        mode={differenceMode}
                        arrow
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
  const { subsets, subsets_data, id } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [subset, setSubset] = usePanelStatePartial(`${id}_mpts`, subsets[0]);
  const { key, compareKey } = data?.view;
  const width = getWidth(props);

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
            <TableCell sx={{ width }}>Metric</TableCell>
            <TableCell sx={{ width }}>{key}</TableCell>
            {compareKey && <TableCell sx={{ width }}>{compareKey}</TableCell>}
            {compareKey && <TableCell sx={{ width }}>Difference</TableCell>}
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
                  <Typography>{formatValueAsNumber(value)} </Typography>
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
                        {formatValueAsNumber(compareMetrics[key])}
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
  const [metric, setMetric] = usePanelStatePartial("cdt_mode", "avg");
  const metricLabel = CONFIDENCE_DISTRIBUTION_METRICS[metric].label;
  const width = getWidth(props);
  const lesserIsBetter = metric === "std";

  return (
    <Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography>Confidence Distribution</Typography>
        <EvaluationSelect
          size="small"
          defaultValue={metric}
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
            <TableCell sx={{ width }}>Subset</TableCell>
            <TableCell sx={{ width }}>
              {key} ({metricLabel})
            </TableCell>
            {compareKey && (
              <TableCell sx={{ width }}>
                {compareKey} ({metricLabel})
              </TableCell>
            )}
            {compareKey && (
              <TableCell sx={{ width }}>Difference ({metricLabel})</TableCell>
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
                <Stack direction="row" spacing={1}>
                  <Typography>
                    {formatValueAsNumber(confidence_distribution[metric])}
                  </Typography>
                  <Difference
                    value={confidence_distribution[metric]}
                    compareValue={compareConfidenceDistribution?.[metric]}
                    mode="trophy"
                    lesserIsBetter={lesserIsBetter}
                  />
                </Stack>
              </TableCell>
              {compareKey && (
                <TableCell>
                  {compareSubsetsData ? (
                    <Stack direction="row" spacing={1}>
                      <Typography>
                        {formatValueAsNumber(
                          compareConfidenceDistribution[metric]
                        )}
                      </Typography>
                      <Difference
                        value={compareConfidenceDistribution[metric]}
                        compareValue={confidence_distribution[metric]}
                        mode="trophy"
                        lesserIsBetter={lesserIsBetter}
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
  const { scenario, compareScenario, loadView, trackEvent } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [metric, setMetric] = usePanelStatePartial("ps_metric", "all");
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
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
    };

    const fpTrace = {
      x: subsets,
      y: fp,
      name: `${key} False Positives`,
      id: "fp",
      type: "bar",
      offsetgroup: 0,
      marker: { color: SECONDARY_KEY_COLOR },
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
    };
    const fnTrace = {
      x: subsets,
      y: fn,
      name: `${key} False Negatives`,
      id: "fn",
      type: "bar",
      offsetgroup: 0,
      marker: { color: TERTIARY_KEY_COLOR },
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
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
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
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
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
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
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
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

      <Plot
        data={plotData}
        layout={showAllMetric ? { barmode: "stack" } : {}}
        onClick={({ points }) => {
          const firstPoint = points[0];
          const { id } = firstPoint.data;
          const isCompare = firstPoint?.fullData?._input?.isCompare;
          const subset = firstPoint.x;
          const subsetDef = getSubsetDef(scenario, subset);
          trackEvent("evaluation_plot_click", {
            id,
            subsetDef,
            plotName: "prediction_statistics",
          });
          loadView("field", {
            field: id,
            subset_def: subsetDef,
            key: isCompare ? compareKey : undefined,
          });
        }}
      />
      <Legends
        prediction={showAllMetric}
        {...getLegendProps(props)}
        compareKey={compareKey}
      />
    </Stack>
  );
}

function ScenarioModelPerformanceChart(props) {
  const theme = useTheme();
  const { scenario, compareScenario } = props;
  const { subsets, id } = scenario;
  const [subset, setSubset] = usePanelStatePartial(`${id}_mps`, subsets[0]);
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
      hoveron: "points",
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.radial,
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
      hoveron: "points",
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.radial,
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
      <Plot
        data={plotData}
        layout={{
          polar: {
            bgcolor: theme.palette.background.card,
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
  const { scenario, compareScenario, loadView, trackEvent, data } = props;
  const { subsets, id } = scenario;
  const compareKey = data?.view?.compareKey;
  const [subset, setSubset] = usePanelStatePartial(`${id}_cms`, subsets[0]);
  const subsetData = scenario.subsets_data[subset];
  const compareSubsetData = compareScenario?.subsets_data[subset];
  const [config, setConfig] = usePanelStatePartial(`${subset}_matrix_config`, {
    log: true,
  });
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
          true,
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
            key={subset}
            config={config}
            onSave={setConfig}
            classes={classes}
          />
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1}>
        <Stack sx={{ width: comparePlotData ? "50%" : "100%" }}>
          <Plot
            data={plotData}
            onClick={({ points }) => {
              const firstPoint = points[0];
              const subsetDef = getSubsetDef(scenario, subset);
              trackEvent("evaluation_plot_click", {
                id: scenario.id,
                subsetDef,
                plotName: "confusion_matrix",
              });
              loadView("matrix", {
                x: firstPoint.x,
                y: firstPoint.y,
                subset_def: subsetDef,
              });
            }}
            tooltip={(event: any) => {
              const [point] = event.points;
              const x = point.x;
              const y = point.y;
              const z = point.z;
              return {
                data: [
                  { label: "Count", value: z },
                  { label: "predicted", value: x },
                  { label: "truth", value: y },
                ],
              };
            }}
          />
        </Stack>
        {comparePlotData && (
          <Stack sx={{ width: "50%" }}>
            <Plot
              data={comparePlotData}
              onClick={({ points }) => {
                const firstPoint = points[0];
                const subsetDef = getSubsetDef(scenario, subset);
                trackEvent("evaluation_plot_click", {
                  id: scenario.id,
                  subsetDef,
                  plotName: "confusion_matrix",
                });
                loadView("matrix", {
                  x: firstPoint.x,
                  y: firstPoint.y,
                  subset_def: subsetDef,
                  key: compareKey,
                });
              }}
              tooltip={(event: any) => {
                const [point] = event.points;
                const x = point.x;
                const y = point.y;
                const z = point.z;
                return {
                  data: [
                    { label: "Count", value: z },
                    { label: "predicted", value: x },
                    { label: "truth", value: y },
                  ],
                };
              }}
            />
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
  const [mode, setMode] = usePanelStatePartial("cd_mode", "overview");
  const isOverview = mode === "overview";

  const plotData: any = [];

  if (!isOverview) {
    const y = [];
    for (const subset in subsets_data) {
      const subsetData = subsets_data[subset];
      const { confidence_distribution } = subsetData;
      y.push(confidence_distribution[mode]);
    }
    plotData.push({
      x: subsets,
      y,
      type: "bar",
      name: key,
      marker: { color: KEY_COLOR },
    });
    if (compareSubsetsData) {
      const compareY = [];
      for (const subset of subsets) {
        const subsetData = compareSubsetsData[subset];
        const { confidence_distribution } = subsetData;
        compareY.push(confidence_distribution[mode]);
      }
      plotData.push({
        x: subsets,
        y: compareY,
        type: "bar",
        name: compareKey,
        marker: { color: COMPARE_KEY_COLOR },
      });
    }
  } else {
    if (compareSubsetsData) {
      const x = [];
      const q1 = [];
      const median = [];
      const q3 = [];
      const lowerfence = [];
      const upperfence = [];
      const compareQ1 = [];
      const compareMedian = [];
      const compareQ3 = [];
      const compareLowerfence = [];
      const compareUpperfence = [];

      for (const subset of subsets) {
        const subsetData = subsets_data[subset];
        const compareSubsetData = compareSubsetsData[subset];
        const { confidence_distribution } = subsetData;
        const compareConfidenceDistribution =
          compareSubsetData.confidence_distribution;
        x.push(subset);
        lowerfence.push(confidence_distribution.min);
        q1.push(confidence_distribution.avg - confidence_distribution.std);
        median.push(confidence_distribution.avg);
        q3.push(confidence_distribution.avg + confidence_distribution.std);
        upperfence.push(confidence_distribution.max);

        compareLowerfence.push(compareConfidenceDistribution.min);
        compareQ1.push(
          compareConfidenceDistribution.avg - compareConfidenceDistribution.std
        );
        compareMedian.push(compareConfidenceDistribution.avg);
        compareQ3.push(
          compareConfidenceDistribution.avg + compareConfidenceDistribution.std
        );
        compareUpperfence.push(compareConfidenceDistribution.max);
      }
      plotData.push({
        type: "box",
        x,
        q1,
        median,
        q3,
        lowerfence,
        upperfence,
        marker: { color: KEY_COLOR },
      });
      plotData.push({
        type: "box",
        x,
        q1: compareQ1,
        median: compareMedian,
        q3: compareQ3,
        lowerfence: compareLowerfence,
        upperfence: compareUpperfence,
        marker: { color: COMPARE_KEY_COLOR },
      });
    } else {
      const x = [];
      const q1 = [];
      const median = [];
      const q3 = [];
      const lowerfence = [];
      const upperfence = [];

      for (const subset of subsets) {
        const subsetData = subsets_data[subset];
        const { confidence_distribution } = subsetData;
        x.push(subset);
        lowerfence.push(confidence_distribution.min);
        q1.push(confidence_distribution.avg - confidence_distribution.std);
        median.push(confidence_distribution.avg);
        q3.push(confidence_distribution.avg + confidence_distribution.std);
        upperfence.push(confidence_distribution.max);
      }

      plotData.push({
        type: "box",
        x,
        q1,
        median,
        q3,
        lowerfence,
        upperfence,
        marker: { color: KEY_COLOR },
      });
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

      <Plot
        data={plotData}
        layout={compareSubsetsData ? { boxmode: "group" } : {}}
        tooltip={
          isOverview
            ? (event: any) => {
                const [point] = event.points;

                const min = formatValueAsNumber(point.lowerfence);
                const max = formatValueAsNumber(point.upperfence);
                const q1 = formatValueAsNumber(point.q1);
                const q3 = formatValueAsNumber(point.q3);
                const mean = formatValueAsNumber(point.median);
                const label = point.x;
                return {
                  label,
                  data: [
                    { label: "Minimum", value: min },
                    { label: "Maximum", value: max },
                    { label: "Q1", value: q1 },
                    { label: "Mean", value: mean },
                    { label: "Q3", value: q3 },
                  ],
                };
              }
            : undefined
        }
      />

      <Legends {...getLegendProps(props)} />
    </Stack>
  );
}

function MetricPerformanceChart(props) {
  const { scenario, compareScenario, loadView, trackEvent } = props;
  const { subsets, subsets_data } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const [metric, setMetric] = usePanelStatePartial(
    "mp_mode",
    "average_confidence"
  );
  const { key, compareKey } = props.data?.view;

  const y = subsets.map((subset) => {
    const subsetData = subsets_data[subset];
    return subsetData.metrics[metric];
  });

  const plotData = [
    {
      x: subsets,
      y,
      type: "bar",
      name: key,
      marker: { color: KEY_COLOR },
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
    },
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
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
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
      <Plot
        data={plotData}
        onClick={({ points }) => {
          const subset = points[0]?.x;
          const subsetDef = getSubsetDef(scenario, subset);
          if (!subsetDef) return;
          trackEvent("evaluation_plot_click", {
            id: scenario.id,
            subsetDef,
            plotName: "metric_performance",
          });
          return loadView("subset", { subset_def: subsetDef });
        }}
      />
      <Legends {...getLegendProps(props)} />
    </Stack>
  );
}

function SubsetDistributionChart(props) {
  const { scenario, compareScenario, loadView, trackEvent } = props;
  const { subsets, subsets_data, type } = scenario;
  const compareSubsetsData = compareScenario?.subsets_data;
  const { key, compareKey } = props.data?.view;

  const y = subsets.map((subset) => {
    const subsetData = subsets_data[subset];
    return subsetData.distribution;
  });

  const plotData = [
    {
      x: subsets,
      y,
      type: "bar",
      name: key,
      marker: { color: KEY_COLOR },
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
    },
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
      hovertemplate: PLOT_TOOLTIP_TEMPLATES.bar,
    });
  }

  return (
    <Stack>
      <Typography>Subset Distribution</Typography>
      <Plot
        data={plotData}
        onClick={({ points }) => {
          const subset = points[0]?.x;
          const subsetDef = getSubsetDef(scenario, subset);
          if (!subsetDef) return;
          trackEvent("evaluation_plot_click", {
            id: scenario.id,
            subsetDef,
            plotName: "subset_distribution",
          });
          return loadView("subset", { subset_def: subsetDef });
        }}
        layout={{
          xaxis: { title: { text: X_AXIS_TITLES[type] } },
          yaxis: { title: { text: "Label Instances" } },
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

function getWidth(props) {
  const { compareKey } = props.data?.view || {};
  return compareKey ? "25%" : "50%";
}

const X_AXIS_TITLES = {
  view: "Saved view",
  label_attribute: "Attribute value",
  sample_field: "Field value",
  custom_code: "Subset",
};

const PLOT_TOOLTIP_TEMPLATES = {
  bar: "<b>%{fullData.name}</b><br>" + "x: %{x}<br>" + "y: %{y}<extra></extra>",
  radial: "%{fullData.name} %{theta}: %{r}<extra></extra>",
};
