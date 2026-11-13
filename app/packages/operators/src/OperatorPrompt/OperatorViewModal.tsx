import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import OperatorIO from "../OperatorIO";
import OperatorPalette from "../OperatorPalette";
import { useShowOperatorIO } from "../state";
import { PaletteContentContainer } from "../styled-components";

/** e2e specs wait on each output an operator shows, and on its dismissal */
type OperatorViewModalE2EEvents = {
  /** `data` is the shown data, as JSON */
  "e2e:operators:output-shown": { visible: boolean; data: string };
};

export default function OperatorViewModal() {
  const io = useShowOperatorIO();

  useEffect(() => {
    getEventBus<OperatorViewModalE2EEvents>().dispatch(
      "e2e:operators:output-shown",
      { visible: io.visible, data: JSON.stringify(io.data ?? {}) },
    );
  }, [io.visible, io.data]);

  if (!io.visible) return null;

  return createPortal(
    <OperatorPalette
      onSubmit={io.hide}
      onClose={io.hide}
      submitButtonText="Done"
      dialogProps={{ PaperProps: { "data-cy": "operators-prompt-view-modal" } }}
    >
      <PaletteContentContainer>
        <OperatorIO
          id="operators_io_view_modal"
          schema={io.schema}
          data={io.data || {}}
          type={io.type}
        />
      </PaletteContentContainer>
    </OperatorPalette>,
    document.body,
  );
}
