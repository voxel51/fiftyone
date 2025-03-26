import React from "react";
import { Box, Button, Card, Stack, Typography } from "@mui/material";
import { scenarioCardStyles } from "../styles";
import EvaluationIcon from "../EvaluationIcon";

interface ScenarioAnalysisProps {
  onCreateScenario: () => void;
}

export default function ScenarioAnalysis({
  onCreateScenario,
}: ScenarioAnalysisProps) {
  return (
    <Card sx={scenarioCardStyles.card}>
      <Stack direction="row" sx={scenarioCardStyles.header}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={scenarioCardStyles.title}>
            Scenario Analysis
          </Typography>
          <Typography sx={scenarioCardStyles.newBadge}>NEW</Typography>
        </Stack>
      </Stack>

      <Box sx={scenarioCardStyles.emptyState}>
        <Stack spacing={1.5} alignItems="center">
          <Box sx={scenarioCardStyles.iconContainer}>
            <EvaluationIcon type="scenario" />
          </Box>
          <Typography sx={scenarioCardStyles.emptyStateText}>
            No scenarios yet
          </Typography>
          <Typography sx={scenarioCardStyles.emptyStateDescription}>
            Scenario analysis helps you analyze model performance across
            different data segments.
          </Typography>
        </Stack>

        <Button
          variant="contained"
          sx={scenarioCardStyles.createButton}
          onClick={onCreateScenario}
        >
          Create scenario
        </Button>
      </Box>
    </Card>
  );
}
