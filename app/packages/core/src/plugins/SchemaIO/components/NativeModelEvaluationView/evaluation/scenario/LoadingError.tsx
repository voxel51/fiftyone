import { Box, Stack, Typography } from "@mui/material";
import React from "react";
import { scenarioCardStyles } from "../../styles";
import Button from "../../../Button";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import TooltipProvider from "../../../TooltipProvider";

interface Props {
  code: "scenario_load_error";
  description: string;
  onDelete: () => void;
  onEdit: () => void;
  readOnly: boolean;
}
export default function LoadingError(props: Props) {
  const { code, description, onDelete, onEdit, readOnly } = props;
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
        <Stack direction="row" spacing={1}>
          <TooltipProvider
            title={
              readOnly ? "You do not have permission to edit scenarios" : ""
            }
          >
            <Button
              size="medium"
              variant="contained"
              onClick={onEdit}
              disabled={readOnly}
            >
              Edit Scenario
            </Button>
          </TooltipProvider>
          <TooltipProvider
            title={
              readOnly ? "You do not have permission to delete scenarios" : ""
            }
          >
            <Button
              variant="outlined"
              size="medium"
              onClick={onDelete}
              disabled={readOnly}
            >
              Delete Scenario
            </Button>
          </TooltipProvider>
        </Stack>
      </Stack>
    </Box>
  );
}
