import React from "react";
import { Box, Button, Card, Stack, Typography } from "@mui/material";
import { scenarioCardStyles } from "../styles";
import EvaluationIcon from "../EvaluationIcon";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";

const CONFIGURE_SCENARIO_ACTION = "model_evaluation_configure_scenario";

interface ScenarioAnalysisProps {
  onCreateScenario: () => void;
  evaluationConfig?: {
    gt_field: string;
  };
}

export default function ScenarioAnalysis({
  onCreateScenario,
  evaluationConfig,
}: ScenarioAnalysisProps) {
  const panelId = usePanelId();
  const promptOperator = usePanelEvent();

  const handleCreateScenario = () => {
    promptOperator(panelId, {
      params: {
        gt_field: evaluationConfig?.gt_field,
        scenario_type: "custom_code",
        scenario_name: "test", // TODO: Edit will pass current name
      },
      operator: CONFIGURE_SCENARIO_ACTION,
      prompt: true,
    });
  };

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
          onClick={handleCreateScenario}
        >
          Create scenario
        </Button>
      </Box>
    </Card>
  );
}
