import { useTrackEvent } from "@fiftyone/analytics";
import { TooltipProvider } from "@fiftyone/components";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { useMutation } from "@fiftyone/state";
import Add from "@mui/icons-material/Add";
import { Button } from "@mui/material";
import React from "react";

export default function CreateScenario(props: CreateScenarioPropsType) {
  const {
    evalKey,
    compareKey,
    loadScenarios,
    gt_field,
    onAdd,
    eval_id,
    variant = "icon",
    canCreate,
  } = props;

  const panelId = usePanelId();
  const promptOperator = usePanelEvent();
  const trackEvent = useTrackEvent();
  const [enable, message] = useMutation(canCreate, "create scenario");

  return (
    <TooltipProvider title={message} placement="bottom">
      <Button
        size="small"
        variant="contained"
        onClick={() => {
          promptOperator(panelId, {
            params: {
              gt_field,
              scenario_type: "sample_field",
              scenario_name: "",
              key: evalKey,
              compare_key: compareKey,
              eval_id,
            },
            operator: CONFIGURE_SCENARIO_ACTION,
            prompt: true,
            callback: (results: unknown) => {
              trackEvent("create_scenario_modal_open", {
                eval_id,
              });
              loadScenarios(() => {
                onAdd?.(results?.result?.id);
              });
            },
          });
        }}
        sx={{ minWidth: "auto", height: "100%" }}
        disabled={!enable}
      >
        {variant === "icon" && <Add />}
        {variant === "text" && "Create a scenario"}
      </Button>
    </TooltipProvider>
  );
}

const CONFIGURE_SCENARIO_ACTION = "model_evaluation_configure_scenario";

type CreateScenarioPropsType = {
  evalKey: string;
  compareKey?: string;
  loadScenarios: (callback: () => void) => void;
  gt_field: string;
  onAdd?: (id: string) => void;
  eval_id: string;
  canCreate: boolean;
  variant?: "icon" | "text";
};
