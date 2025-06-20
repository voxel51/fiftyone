import { EditableLabel, LoadingDots } from "@fiftyone/components";
import { useMutation } from "@fiftyone/state";
import { Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import React from "react";
import ActionMenu from "./ActionMenu";
import Evaluate from "./Evaluate";
import EvaluationIcon from "./EvaluationIcon";
import EvaluationNotes from "./EvaluationNotes";
import Status from "./Status";
import {
  ConcreteEvaluationType,
  EvaluationCardProps,
  OverviewProps,
} from "./Types";

export default function Overview(props: OverviewProps) {
  const {
    evaluations,
    onEvaluate,
    onSelect,
    statuses = {},
    notes = {},
    permissions = {},
    pending_evaluations,
    onRename,
  } = props;
  const count = evaluations.length;
  const { can_delete_evaluation, can_rename } = permissions;

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
            onRename={onRename}
            hasDeletePermission={can_delete_evaluation}
            hasRenamePermission={can_rename}
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
            onRename={() => {
              // Do nothing. No rename for pending evaluations
            }}
          />
        );
      })}
    </Stack>
  );
}

function EvaluationCard(props: EvaluationCardProps) {
  const {
    pending,
    onSelect,
    eval_key,
    note,
    status,
    id,
    type,
    method,
    onRename,
    hasDeletePermission,
    hasRenamePermission,
  } = props;
  const [hovering, setHovering] = React.useState(false);

  const [enable, message] = useMutation(
    hasRenamePermission,
    "rename evaluation"
  );

  return (
    <CardActionArea
      key={eval_key}
      disabled={pending}
      onMouseEnter={() => {
        setHovering(true);
      }}
      onMouseLeave={() => {
        setHovering(false);
      }}
    >
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
            <EditableLabel
              label={eval_key}
              labelProps={{ sx: { fontSize: 16, fontWeight: 600 } }}
              onSave={(newName) => {
                onRename(eval_key, newName);
              }}
              showEditIcon={hovering}
              disabled={!enable}
              title={message}
            />
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems={"center"}>
            {pending && (
              <Chip
                variant="filled"
                size="small"
                label={
                  <LoadingDots
                    text="Evaluating"
                    style={{
                      fontSize: "1rem",
                      paddingLeft: 6,
                      color: "#999999",
                    }}
                  />
                }
              />
            )}
            {status && <Status status={status} readOnly />}
            {!pending && (
              <ActionMenu
                evaluationName={eval_key}
                canDelete={hasDeletePermission}
              />
            )}
          </Stack>
        </Stack>
        {note && <EvaluationNotes notes={note} variant="overview" />}
      </Card>
    </CardActionArea>
  );
}
