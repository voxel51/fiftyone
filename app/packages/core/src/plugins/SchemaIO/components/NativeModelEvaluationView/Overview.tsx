import { LoadingDots } from "@fiftyone/components";
import { Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
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
    pending_evaluations,
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
        <Evaluate
          onEvaluate={onEvaluate}
          permissions={permissions}
          variant="overview"
        />
      </Stack>
      {evaluations.map((evaluation) => {
        const { key, id } = evaluation;
        const status = statuses[id] || "needs_review";
        const note = notes[id];
        return (
          <EvaluationCard
            key={key}
            eval_key={key}
            id={id}
            status={status}
            note={note}
            onSelect={onSelect}
          />
        );
      })}
      {pending_evaluations.map((evaluation) => {
        const { eval_key } = evaluation;
        return (
          <EvaluationCard
            key={eval_key}
            eval_key={eval_key}
            pending
            onSelect={onSelect}
          />
        );
      })}
    </Stack>
  );
}

function EvaluationCard(props: EvaluationCardProps) {
  const { pending, onSelect, eval_key, note, status, id } = props;
  return (
    <CardActionArea key={eval_key} disabled={pending}>
      <Card
        sx={{ p: 2, cursor: "pointer" }}
        onClick={() => {
          onSelect(eval_key, id);
        }}
      >
        <Stack direction="row" justifyContent="space-between">
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
            {eval_key}
          </Typography>
          {pending && (
            <Chip variant="filled" label={<LoadingDots text="Evaluating" />} />
          )}
          {status && <Status status={status} />}
        </Stack>
        {note && <EvaluationNotes notes={note} variant="overview" />}
      </Card>
    </CardActionArea>
  );
}

type OverviewProps = {
  evaluations: EvaluationType[];
  onSelect: (key: string, id: string) => void;
  onEvaluate: () => void;
  statuses?: Record<string, string>;
  notes?: Record<string, string>;
  permissions?: Record<string, boolean>;
  pending_evaluations: PendingEvaluationType[];
};

type EvaluationType = {
  key: string;
  id: string;
  description: string;
  status: string;
};

type PendingEvaluationType = {
  eval_key: string;
  doc_id?: string;
};

type EvaluationCardProps = {
  eval_key: string;
  id?: string;
  note?: string;
  onSelect: OverviewProps["onSelect"];
  pending?: boolean;
  status?: string;
};
