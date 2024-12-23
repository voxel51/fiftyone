import { MuiButton } from "@fiftyone/components";
import { Add } from "@mui/icons-material";
import { Box } from "@mui/material";
import React from "react";

export default function Evaluate(props: EvaluateProps) {
  const { onEvaluate, permissions } = props;
  const canEvaluate = permissions.can_evaluate;
  return (
    <Box
      title={canEvaluate ? "" : "You do not have permission to evaluate model"}
      sx={{ cursor: canEvaluate ? "pointer" : "not-allowed" }}
    >
      <MuiButton
        onClick={onEvaluate}
        startIcon={<Add />}
        variant="contained"
        disabled={!canEvaluate}
      >
        Evaluate Model
      </MuiButton>
    </Box>
  );
}

type EvaluateProps = {
  variant: "empty" | "overview";
  onEvaluate: () => void;
  permissions: Record<string, boolean>;
};
