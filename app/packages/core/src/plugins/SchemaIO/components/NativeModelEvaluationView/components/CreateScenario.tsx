import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import Add from "@mui/icons-material/Add";
import { Button } from "@mui/material";
import React from "react";

export default function CreateScenario(props) {
  const { eval_id, loadScenarios, gt_field } = props;
  const panelId = usePanelId();
  const promptOperator = usePanelEvent();

  return (
    <Button
      size="small"
      variant="contained"
      onClick={() => {
        promptOperator(panelId, {
          params: {
            gt_field,
            scenario_type: "custom_code",
            scenario_name: "test", // # TODO: Edit will pass current name
            eval_id,
          },
          operator: CONFIGURE_SCENARIO_ACTION,
          prompt: true,
          callback: loadScenarios,
        });
      }}
      sx={{ minWidth: "auto" }}
    >
      <Add />
    </Button>
  );
}

const CONFIGURE_SCENARIO_ACTION = "model_evaluation_configure_scenario";
