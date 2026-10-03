import { Modal } from "@mui/material";
import { Card } from "@voxel51/voodo";
import { useId } from "react";
import OperatorPromptFrame from "../components/OperatorPromptFrame";
import { OperatorPromptPropsType } from "../types";
import { getOperatorPromptConfigs } from "../utils";

export default function OperatorFullScreenPrompt(
  props: OperatorPromptPropsType,
) {
  const { prompt } = props;
  const { title } = getOperatorPromptConfigs(prompt);
  const titleId = useId();

  return (
    <Modal
      open
      onClose={prompt.close}
      disablePortal
      hideBackdrop
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : prompt.operator?.label}
      style={{ zIndex: 9999 }}
    >
      <div style={{ height: "100%", outline: "none" }}>
        <Card
          style={{ height: "100%", borderRadius: 0 }}
          data-cy="operators-prompt-full-screen"
        >
          <OperatorPromptFrame
            prompt={prompt}
            dataCyPrefix="operators-prompt-full-screen"
            contentStyle={{ maxHeight: "calc(100vh - 120px)" }}
            titleId={titleId}
          />
        </Card>
      </div>
    </Modal>
  );
}
