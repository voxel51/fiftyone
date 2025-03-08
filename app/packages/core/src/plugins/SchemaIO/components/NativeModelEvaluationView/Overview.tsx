import { LoadingDots } from "@fiftyone/components";
import { Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import React from "react";
import Evaluate from "./Evaluate";
import EvaluationNotes from "./EvaluationNotes";
import Status from "./Status";
import {
  ConcreteEvaluationType,
  EvaluationCardProps,
  OverviewProps,
} from "./Types";
import EvaluationIcon from "./EvaluationIcon";

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
        const { key, id, type, method } = evaluation;
        const status = statuses[id] || "needs_review";
        const note = notes[id];
        return (
          <EvaluationCard
            key={key}
            eval_key={key}
            id={id}
            status={status}
            note={note}
            type={type}
            method={method}
            onSelect={onSelect}
          />
        );
      })}
      {pending_evaluations.map((evaluation) => {
        const { eval_key, type, method } = evaluation;
        return (
          <EvaluationCard
            key={eval_key}
            eval_key={eval_key}
            pending
            onSelect={onSelect}
            type={type}
            method={method}
          />
        );
      })}
    </Stack>
  );
}

function EvaluationCard(props: EvaluationCardProps) {
  const { pending, onSelect, eval_key, note, status, id, type, method } = props;

  return (
    <CardActionArea key={eval_key} disabled={pending}>
      <Card
        sx={{ p: 2, cursor: "pointer" }}
        onClick={() => {
          onSelect(eval_key, id);
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <EvaluationIcon
              type={type as ConcreteEvaluationType}
              method={method}
            />
            <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
              {eval_key}
            </Typography>
          </Stack>
          {pending && (
            <Chip
              variant="filled"
              size="small"
              label={
                <LoadingDots
                  text="Evaluating"
                  style={{ fontSize: "1rem", paddingLeft: 6, color: "#999999" }}
                />
              }
            />
          )}
          {status && <Status status={status} readOnly />}
        </Stack>
        {note && <EvaluationNotes notes={note} variant="overview" />}
      </Card>
    </CardActionArea>
  );
}
