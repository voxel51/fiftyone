import { MuiButton } from "@fiftyone/components";
import { Add } from "@mui/icons-material";
import React from "react";

export default function Evaluate(props: EvaluateProps) {
  const { onEvaluate } = props;
  return (
    <MuiButton onClick={onEvaluate} startIcon={<Add />} variant="contained">
      Evaluate Model
    </MuiButton>
  );
}

type EvaluateProps = {
  variant: "empty" | "overview";
  onEvaluate: () => void;
  permissions: Record<string, boolean>;
};
