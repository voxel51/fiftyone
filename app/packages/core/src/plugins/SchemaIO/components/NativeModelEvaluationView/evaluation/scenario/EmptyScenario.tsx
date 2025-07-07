import { Box, Stack, Typography } from "@mui/material";
import CreateScenario from "../../components/CreateScenario";
import EvaluationIcon from "../../EvaluationIcon";
import { scenarioCardStyles } from "../../styles";

export default function EmptyScenario(props: EmptyScenarioPropsType) {
  return (
    <Box sx={scenarioCardStyles.emptyState}>
      <Stack spacing={1.5} alignItems="center">
        <Box sx={scenarioCardStyles.iconContainer}>
          <EvaluationIcon />
        </Box>
        <Typography variant="h6">No scenarios yet</Typography>
        <Typography variant="body1" color="text.secondary">
          Scenario analysis helps you analyze model performance across different
          data segments.
        </Typography>
      </Stack>
      <Box>
        <CreateScenario variant="text" {...props} />
      </Box>
    </Box>
  );
}

type EmptyScenarioPropsType = {
  eval_id: string;
  loadScenarios: (callback: () => void) => void;
  gt_field: string;
  evalKey: string;
  compareKey?: string;
  canCreate: boolean;
};
