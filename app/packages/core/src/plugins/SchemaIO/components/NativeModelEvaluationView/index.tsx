import { PanelCTA } from "@fiftyone/components";
import { constants } from "@fiftyone/utilities";
import { Box } from "@mui/material";
import React, { useCallback, useMemo } from "react";
import Evaluate from "./Evaluate";
import Evaluation from "./Evaluation";
import Overview from "./Overview";
import { useTriggerEvent } from "./utils";

const TRY_LINK = "http://voxel51.com/try-evaluation";

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
    return evaluations.map(({ key, id, type, method }) => ({
      key,
      id,
      type,
      method,
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
  const showEmptyOverview =
    computedEvaluations.length === 0 && pending_evaluations.length === 0;
  const triggerEvent = useTriggerEvent();
  const [showCTA, setShowCTA] = React.useState(false);
  const onEvaluate = useCallback(() => {
    if (constants.IS_APP_MODE_FIFTYONE) {
      setShowCTA(true);
    } else {
      triggerEvent(on_evaluate_model);
    }
  }, [triggerEvent, on_evaluate_model]);

  return (
    <Box sx={{ height: "100%" }}>
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
        (showEmptyOverview || showCTA ? (
          <PanelCTA
            label="Create your first model evaluation"
            demoLabel="Upgrade to FiftyOne Teams to Evaluate Models"
            description="Analyze and improve models collaboratively with your team"
            docLink="https://docs.voxel51.com/user_guide/evaluation.html"
            docCaption="Learn how to evaluate models via code."
            demoDocCaption="Not ready to upgrade yet? Learn how to evaluate models via code."
            icon="ssid_chart"
            Actions={() => {
              return (
                <Evaluate
                  onEvaluate={onEvaluate}
                  permissions={permissions}
                  variant="empty"
                />
              );
            }}
            name="Model Evaluation"
            onBack={() => {
              setShowCTA(false);
            }}
            mode={showCTA ? "default" : "onboarding"}
            tryLink={TRY_LINK}
          />
        ) : (
          <Overview
            onSelect={(key, id) => {
              onChange("view", { page: "evaluation", key, id });
              triggerEvent(on_change_view);
              triggerEvent(load_evaluation_view);
            }}
            onEvaluate={onEvaluate}
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
