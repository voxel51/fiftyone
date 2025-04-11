import { Box, Stack, Typography } from "@mui/material";
import React from "react";
import { scenarioCardStyles } from "../../styles";
import Button from "../../../Button";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";

interface Props {
  code: "scenario_load_error";
  description: string;
}
export default function LoadingError(props: Props) {
  const { code, description } = props;
  const title =
    code === "scenario_load_error" ? "Scenario data unavailable" : "Error";

  return (
    <Box sx={scenarioCardStyles.emptyState}>
      <Stack spacing={1.5} alignItems="center">
        <ErrorOutlineOutlinedIcon sx={{ color: "#FFC48B", fontSize: "3rem" }} />
        <Typography sx={scenarioCardStyles.emptyStateText}>{title}</Typography>
        <Typography sx={scenarioCardStyles.emptyStateDescription}>
          {description}
        </Typography>
        <Button variant="outlined" size="medium">
          Delete Scenario (TODO)
        </Button>
      </Stack>
    </Box>
  );
}
