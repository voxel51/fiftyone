import { Card, CardActionArea, Stack, Typography } from "@mui/material";
import React from "react";
import Evaluate from "./Evaluate";
import EvaluationNotes from "./EvaluationNotes";
import Status from "./Status";

export default function Overview(props: OverviewProps) {
  const {
    evaluations,
    onEvaluate,
    onSelect,
    statuses = {},
    notes = {},
    permissions = {},
  } = props;
  const count = evaluations.length;

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <Typography variant="body1" color="secondary">
          {count} Model Evaluations
        </Typography>
        <Evaluate onEvaluate={onEvaluate} permissions={permissions} />
      </Stack>
      {evaluations.map((evaluation) => {
        const { key, id } = evaluation;
        const status = statuses[id] || "needs_review";
        const note = notes[id];

        return (
          <CardActionArea key={key}>
            <Card
              sx={{ p: 2, cursor: "pointer" }}
              onClick={() => {
                onSelect(key, id);
              }}
            >
              <Stack direction="row" justifyContent="space-between">
                <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
                  {key}
                </Typography>
                <Status status={status} />
              </Stack>
              <EvaluationNotes notes={note} variant="overview" />
            </Card>
          </CardActionArea>
        );
      })}
    </Stack>
  );
}

type OverviewProps = {
  evaluations: EvaluationType[];
  onSelect: (key: string, id: string) => void;
  onEvaluate: () => void;
  statuses?: Record<string, string>;
  notes?: Record<string, string>;
  permissions?: Record<string, boolean>;
};

type EvaluationType = {
  key: string;
  id: string;
  description: string;
  status: string;
};
