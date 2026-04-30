import { usePanelAreaRenderer } from "./hooks";
import { PanelAreaProps } from "./types";

export default function PanelArea(props: PanelAreaProps) {
  const { id } = props;

  const { currentRendererId, CurrentRenderer } = usePanelAreaRenderer(id);

  if (!currentRendererId) return null;

  return CurrentRenderer;
}
