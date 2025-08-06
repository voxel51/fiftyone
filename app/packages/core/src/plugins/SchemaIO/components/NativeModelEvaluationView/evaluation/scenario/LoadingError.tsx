import { CodeBlock, TooltipProvider } from "@fiftyone/components";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { Box, Stack, Typography } from "@mui/material";
import Button from "../../../Button";
import { scenarioCardStyles } from "../../styles";
import { useState } from "react";

export default function LoadingError(props: LoadingErrorProps) {
  const { code, error, trace, onDelete, onEdit, readOnly } = props;

  const [showTrace, setShowTrace] = useState(false);

  const title =
    code === "scenario_load_error" ? "Scenario data unavailable" : "Error";

  return (
    <Box sx={scenarioCardStyles.emptyState}>
      <Stack spacing={1.5} alignItems="center">
        <ErrorOutlineOutlinedIcon sx={{ color: "#FFC48B", fontSize: "3rem" }} />
        <Typography sx={scenarioCardStyles.emptyStateText}>{title}</Typography>
        <Typography sx={scenarioCardStyles.emptyStateDescription}>
          {error}
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
          {trace && (
            <Button
              variant="outlined"
              size="medium"
              onClick={() => {
                setShowTrace(!showTrace);
              }}
            >
              {showTrace ? "Hide" : "Show"} Technical Trace
            </Button>
          )}
        </Stack>
        {showTrace && trace && (
          <Box sx={{ width: "50%" }}>
            <CodeBlock text={trace} language="python" />
          </Box>
        )}
      </Stack>
    </Box>
  );
}

type LoadingErrorProps = {
  code: "scenario_load_error";
  error: string;
  id: string;
  trace: string;
  onDelete: () => void;
  onEdit: () => void;
  readOnly: boolean;
};
