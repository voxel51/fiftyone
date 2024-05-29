import { createPortal } from "react-dom";
import OperatorIO from "../OperatorIO";
import OperatorPalette from "../OperatorPalette";
import { useShowOperatorIO } from "../state";
import { PaletteContentContainer } from "../styled-components";

export default function OperatorViewModal() {
  const io = useShowOperatorIO();
  if (!io.visible) return null;

  return createPortal(
    <OperatorPalette
      onSubmit={io.hide}
      onClose={io.hide}
      submitButtonText="Done"
    >
      <PaletteContentContainer>
        <OperatorIO schema={io.schema} data={io.data || {}} type={io.type} />
      </PaletteContentContainer>
    </OperatorPalette>,
    document.body
  );
}
