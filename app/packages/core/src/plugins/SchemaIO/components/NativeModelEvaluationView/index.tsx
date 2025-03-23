import { PanelCTA } from "@fiftyone/components";
import { constants } from "@fiftyone/utilities";
import { Box } from "@mui/material";
import React, { useCallback, useMemo } from "react";
import { useRecoilState } from "recoil";
import ConfirmationDialog from "./ConfirmationDialog";
import Evaluate from "./Evaluate";
import Evaluation from "./Evaluation";
import Overview from "./Overview";
import {
  openModelEvalDialog,
  selectedModelEvaluation,
  useTriggerEvent,
} from "./utils";

const TRY_LINK = "http://voxel51.com/try-evaluation";

export default function NativeModelEvaluationView(props) {
  const { data = {}, schema, onChange, layout } = props;
  const [openDialog, setOpenDialog] = useRecoilState(openModelEvalDialog);
  const [selectedEvaluation, setSelectedEvaluation] = useRecoilState(
    selectedModelEvaluation
  );
  const { view } = schema;
  const {
    on_change_view,
    on_evaluate_model,
    load_evaluation,
    load_evaluation_view,
    set_status,
    set_note,
    load_view,
    rename_evaluation,
    delete_evaluation,
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

  const onRename = useCallback(
    (old_name: string, new_name: string) => {
      triggerEvent(
        rename_evaluation,
        { old_name, new_name },
        false,
        (results) => {
          if (results?.error === null) {
            const updatedEvaluations = evaluations.map((evaluation) => {
              if (evaluation.key === old_name) {
                return { ...evaluation, key: new_name };
              }
              return evaluation;
            });
            onChange("evaluations", updatedEvaluations);
            if (page === "evaluation") {
              onChange("view.key", new_name);
            }
          }
        }
      );
    },
    [triggerEvent, rename_evaluation, evaluations, onChange]
  );

  const time = new Date().getTime();

  const onDelete = useCallback(
    (eval_id: string, eval_key: string) => {
      triggerEvent(
        delete_evaluation,
        { eval_id, eval_key },
        false,
        (results) => {
          if (results?.error === null) {
            // update the current page display
            // if after deletion, there is no evaluation left,
            // go to the create evaluation page
            const updatedEvaluations = evaluations.filter(
              (evaluation) => evaluation.id !== eval_id
            );
            onChange("evaluations", updatedEvaluations);
            onChange(
              "view.key",
              `${eval_id}_${updatedEvaluations.length}_${time}`
            );
            if (page === "evaluation") {
              // should return to overview page
              onChange("view", { page: "overview" });
              onChange("view.key", eval_id + "_deleted");
              triggerEvent(on_change_view);
            }
          }
        }
      );
    },
    [triggerEvent, delete_evaluation, evaluations, onChange, time]
  );

  const handleClose = () => {
    setOpenDialog(false);
    setSelectedEvaluation(null);
  };

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
          onRename={onRename}
        />
      )}
      {page === "overview" &&
        (showEmptyOverview || showCTA ? (
          <PanelCTA
            label="Create your first model evaluation"
            demoLabel="Upgrade to FiftyOne Enterprise to Evaluate Models"
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
            onRename={onRename}
          />
        ))}
      <ConfirmationDialog
        open={openDialog}
        handleClose={handleClose}
        evaluations={evaluations}
        handleDelete={onDelete}
      />
    </Box>
  );
}
