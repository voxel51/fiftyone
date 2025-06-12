import { useTrackEvent } from "@fiftyone/analytics";
import { TooltipProvider } from "@fiftyone/components";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import Add from "@mui/icons-material/Add";
import { Button } from "@mui/material";

export default function CreateScenario(props) {
  console.log(">>> testing e2e");
  const {
    evalKey,
    compareKey,
    loadScenarios,
    gt_field,
    onAdd,
    eval_id,
    readOnly,
    variant = "icon",
  } = props;

  const panelId = usePanelId();
  const promptOperator = usePanelEvent();
  const trackEvent = useTrackEvent();

  return (
    <TooltipProvider
      title={
        readOnly
          ? "You do not have permission to create scenarios"
          : "Create Scenario"
      }
      placement="bottom"
    >
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
            callback: (results) => {
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
        disabled={readOnly}
      >
        {variant === "icon" && <Add />}
        {variant === "text" && "Create a scenario"}
      </Button>
    </TooltipProvider>
  );
}

const CONFIGURE_SCENARIO_ACTION = "model_evaluation_configure_scenario";
