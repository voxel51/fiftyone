import { Box, Stack, Typography } from "@mui/material";
import React from "react";
import CreateScenario from "../../components/CreateScenario";
import EvaluationIcon from "../../EvaluationIcon";
import { scenarioCardStyles } from "../../styles";

export default function EmptyScenario(props) {
  return (
    <Box sx={scenarioCardStyles.emptyState}>
      <Stack spacing={1.5} alignItems="center">
        <Box sx={scenarioCardStyles.iconContainer}>
          <EvaluationIcon type="scenario" />
        </Box>
        <Typography variant="h6">No scenarios yet</Typography>
        <Typography variant="body1" color="text.secondary">
          Scenario analysis helps you analyze model performance across different
          data segments.
        </Typography>
      </Stack>
      <CreateScenario variant="text" {...props} />
    </Box>
  );
}
