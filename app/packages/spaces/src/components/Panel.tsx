import { PanelContext } from "../contexts";
import { usePanel } from "../hooks";
import { PanelProps } from "../types";
import { panelNotFoundError } from "../utils";
import { StyledPanel } from "./StyledElements";

export default function Panel({ node }: PanelProps) {
  const panelName = node.type;
  const panel = usePanel(panelName);
  if (!panel) return panelNotFoundError(panelName);
  const { component: Component } = panel;
  return (
    <StyledPanel id={node.id}>
      <PanelContext.Provider value={{ node }}>
        <Component panelNode={node} />
      </PanelContext.Provider>
    </StyledPanel>
  );
}
