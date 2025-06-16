import { MuiButton } from "@fiftyone/components";
import { useMutation } from "@fiftyone/state";
import { Add } from "@mui/icons-material";
import { Box } from "@mui/material";
import React from "react";

export default function Evaluate(props: EvaluateProps) {
  const { onEvaluate, permissions } = props;
  const canEvaluate = permissions.can_evaluate;
  const [enable, message, cursor] = useMutation(canEvaluate, "evaluate model");

  return (
    <Box title={message} sx={{ cursor }}>
      <MuiButton
        onClick={onEvaluate}
        startIcon={<Add />}
        variant="contained"
        disabled={!enable}
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
