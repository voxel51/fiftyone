import { Card, Stack, Typography } from "@mui/material";
import React from "react";
import { scenarioCardStyles } from "../../styles";
import EmptyScenario from "./EmptyScenario";
import Scenarios from "./Scenarios";

export default function EvaluationScenarioAnalysis(props) {
  const { evaluation, data, loadScenarios } = props;
  const { scenarios } = evaluation;
  const evaluationInfo = evaluation.info;
  const evaluationConfig = evaluationInfo.config;
  const scenariosArray = scenarios ? Object.values(scenarios) : [];
  const isEmpty = scenariosArray.length === 0;
  const { key, compareKey } = data?.view || {};

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
          eval_id={data?.view?.id}
          loadScenarios={loadScenarios}
          gt_field={evaluationConfig.gt_field}
          evalKey={key}
          compareKey={compareKey}
        />
      ) : (
        <Scenarios {...props} />
      )}
    </Card>
  );
}
