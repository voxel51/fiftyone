import { Card, Stack, Typography } from "@mui/material";
import { scenarioCardStyles } from "../../styles";
import EmptyScenario from "./EmptyScenario";
import Scenarios from "./Scenarios";

export default function EvaluationScenarioAnalysis(props) {
  const { evaluation, data = {}, loadScenarios } = props;
  const { scenarios } = data;
  const evaluationInfo = evaluation.info;
  const evaluationConfig = evaluationInfo.config;
  const scenariosArray = scenarios ? Object.values(scenarios) : [];
  const isEmpty = scenariosArray.length === 0;
  const { view = {}, permissions = {} } = data;
  const { id, key, compareKey } = view;

  return (
    <Card sx={{ p: 2 }}>
      <Stack direction="row" sx={scenarioCardStyles.header}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6">Scenario Analysis</Typography>
          <Typography sx={scenarioCardStyles.newBadge}>NEW</Typography>
        </Stack>
      </Stack>
      {isEmpty ? (
        <EmptyScenario
          eval_id={id}
          loadScenarios={loadScenarios}
          gt_field={evaluationConfig.gt_field}
          evalKey={key}
          compareKey={compareKey}
          canCreate={permissions.can_create_scenario}
        />
      ) : (
        <Scenarios {...props} />
      )}
    </Card>
  );
}
