import { PanelContext } from "../contexts";
import { usePanel } from "../hooks";
import { PanelProps } from "../types";
import { panelNotFoundError } from "../utils";
import { StyledPanel } from "./StyledElements";
import * as fos from "@fiftyone/state";

export default function Panel({ node }: PanelProps) {
  const panelName = node.type;
  const panel = usePanel(panelName);
  if (!panel) return panelNotFoundError(panelName);
  const { component: Component } = panel;
  const dimensions = fos.useDimensions();

  return (
    <StyledPanel id={node.id} ref={dimensions.ref}>
      <PanelContext.Provider value={{ node }}>
        <Component panelNode={node} dimensions={dimensions} />
      </PanelContext.Provider>
    </StyledPanel>
  );
}
