import { Launch } from "@mui/icons-material";
import { Button } from "@mui/material";
import React from "react";

export default function Evaluate(props: EvaluateProps) {
  const { variant } = props;

  if (variant === "empty") return null;

  return (
    <Button
      endIcon={<Launch />}
      variant="outlined"
      color="secondary"
      href={"https://docs.voxel51.com/user_guide/evaluation.html"}
      target="_blank"
    >
      View documentation
    </Button>
  );
}

type EvaluateProps = {
  variant: "empty" | "overview";
  onEvaluate: () => void;
  permissions: Record<string, boolean>;
};
