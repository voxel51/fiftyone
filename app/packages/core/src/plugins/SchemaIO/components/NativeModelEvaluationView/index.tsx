import { Box } from "@mui/material";
import React, { useMemo } from "react";
import EmptyOverview from "./EmptyOverview";
import Evaluation from "./Evaluation";
import Overview from "./Overview";
import { useTriggerEvent } from "./utils";

export default function NativeModelEvaluationView(props) {
  const { data = {}, schema, onChange, layout } = props;
  const { view } = schema;
  const {
    on_change_view,
    on_evaluate_model,
    load_evaluation,
    load_evaluation_view,
    set_status,
    set_note,
    load_view,
  } = view;
  const {
    evaluations = [],
    view: viewState = {},
    statuses = {},
    notes = {},
    permissions = {},
    pending_evaluations = [],
  } = data;
  const computedEvaluations = useMemo(() => {
    return evaluations.map(({ key, id }) => ({
      key,
      id,
      description: "The description for evaluation " + key,
      status: "reviewed",
    }));
  }, [evaluations]);
  const keyToId = useMemo(() => {
    return computedEvaluations.reduce((byKey, { key, id }) => {
      byKey[key] = id;
      return byKey;
    }, {});
  }, [computedEvaluations]);
  const { page = "overview", key, id, compareKey } = viewState;
  const showEmptyOverview = computedEvaluations.length === 0;
  const triggerEvent = useTriggerEvent();

  return (
    <Box>
      {page === "evaluation" && (
        <Evaluation
          name={key}
          id={id}
          navigateBack={() => {
            onChange("view.compareKey", null);
            onChange("view", { page: "overview" });
            triggerEvent(on_change_view);
          }}
          data={data}
          loadEvaluation={(key?: string) => {
            triggerEvent(load_evaluation, { key, id: keyToId[key as string] });
          }}
          onChangeCompareKey={(compareKey) => {
            onChange("view.compareKey", compareKey);
          }}
          compareKey={compareKey}
          setStatusEvent={set_status}
          statuses={statuses}
          setNoteEvent={set_note}
          notes={notes}
          loadView={(type, options) => {
            triggerEvent(load_view, { type, options });
          }}
        />
      )}
      {page === "overview" &&
        (showEmptyOverview ? (
          <EmptyOverview
            height={layout?.height as number}
            onEvaluate={() => {
              triggerEvent(on_evaluate_model);
            }}
            permissions={permissions}
          />
        ) : (
          <Overview
            onSelect={(key, id) => {
              onChange("view", { page: "evaluation", key, id });
              triggerEvent(on_change_view);
              triggerEvent(load_evaluation_view);
            }}
            onEvaluate={() => {
              triggerEvent(on_evaluate_model);
            }}
            evaluations={computedEvaluations}
            statuses={statuses}
            notes={notes}
            permissions={permissions}
            pending_evaluations={pending_evaluations}
          />
        ))}
    </Box>
  );
}
