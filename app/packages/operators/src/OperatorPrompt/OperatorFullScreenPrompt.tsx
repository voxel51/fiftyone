import { Modal } from "@mui/material";
import { Card } from "@voxel51/voodo";
import OperatorPromptFrame from "../components/OperatorPromptFrame";
import { OperatorPromptPropsType } from "../types";

export default function OperatorFullScreenPrompt(
  props: OperatorPromptPropsType,
) {
  const { prompt } = props;

  return (
    <Modal
      open
      onClose={prompt.close}
      disablePortal
      hideBackdrop
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
          />
        </Card>
      </div>
    </Modal>
  );
}
