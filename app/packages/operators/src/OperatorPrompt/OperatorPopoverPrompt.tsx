import { ClickAwayListener } from "@mui/material";
import { Card } from "@voxel51/voodo";
import OperatorPromptFrame from "../components/OperatorPromptFrame";
import { OperatorPromptPropsType } from "../types";

export default function OperatorPopoverPrompt(props: OperatorPromptPropsType) {
  const { prompt } = props;

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
        width: "100%",
        maxWidth: "min(400px, 90vw)",
        maxHeight: "90vh",
      }}
    >
      <ClickAwayListener onClickAway={prompt.close}>
        <Card
          style={{ position: "relative", minWidth: 250 }}
          data-cy="operators-prompt-popover"
        >
          <OperatorPromptFrame
            prompt={prompt}
            dataCyPrefix="operators-prompt-popover"
            contentStyle={{ maxHeight: "calc(90vh - 120px)" }}
          />
        </Card>
      </ClickAwayListener>
    </div>
  );
}
