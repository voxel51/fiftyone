import { Resizable } from "@fiftyone/components";
import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { PANEL_AREA, SIDEBAR_PANEL_RENDERER_ID } from "./enums";
import { legacyPanelAreaTabId, usePanelArea, usePanels } from "./hooks";
import PanelRenderer from "./PanelRenderer";
import { PanelAreaProps } from "./types";

const DEFAULT_WIDTH = 450;
const DEFAULT_MIN_WIDTH = "0%";
const DEFAULT_MAX_WIDTH = "100%";

const PanelAreaTabs = styled.div`
  display: flex;
  min-height: 28px;
  overflow-x: auto;
  background: var(--fo-palette-background-header);
`;

const PanelAreaTab = styled.button<{ $active: boolean }>`
  display: block;
  flex: 0 0 auto;
  max-width: 128px;
  min-width: 0;
  padding: 2px 8px;
  overflow: hidden;
  cursor: pointer;
  color: ${(props) =>
    props.$active
      ? "var(--fo-palette-text-primary)"
      : "var(--fo-palette-text-secondary)"};
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: ${(props) =>
    props.$active
      ? "var(--fo-palette-background-level2)"
      : "var(--fo-palette-background-inactiveTab)"};
  border: none;
  border-right: 1px solid var(--fo-palette-background-level3);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
`;

export default function PanelArea({
  id,
  isPanelEligible,
  legacySupport = false,
  placement,
  resize,
}: PanelAreaProps) {
  const { defaultWidth, minWidth, maxWidth, direction } = resize || {};
  const computedDefaultWidth = defaultWidth || DEFAULT_WIDTH;
  const [width, setWidth] = useState(computedDefaultWidth);
  const {
    activePanel,
    isVisible,
    legacyRenderers,
    openPanel,
    selectLegacyRenderer,
    setActivePanel,
  } = usePanelArea(id);
  const panels = usePanels(
    useCallback(
      (panel) =>
        panel.panelOptions?.surfaces?.includes(placement) &&
        (!isPanelEligible || isPanelEligible(panel)),
      [isPanelEligible, placement],
    ),
  );
  const supportsLegacy =
    legacySupport === "right-sidebar" && id === PANEL_AREA.SIDEBAR_RIGHT;
  const legacyEntries = useMemo(
    () =>
      supportsLegacy
        ? Array.from(legacyRenderers.entries()).filter(
            ([rendererId]) => rendererId !== SIDEBAR_PANEL_RENDERER_ID,
          )
        : [],
    [legacyRenderers, supportsLegacy],
  );
  const availableTabs = useMemo(
    () => [
      ...panels.map((panel) => ({
        id: panel.name,
        label: panel.label || panel.name,
      })),
      ...legacyEntries.map(([rendererId]) => ({
        id: legacyPanelAreaTabId(rendererId),
        label: rendererId,
      })),
    ],
    [legacyEntries, panels],
  );
  const defaultTabId = availableTabs[0]?.id ?? null;

  useEffect(() => {
    if (!availableTabs.length) {
      if (activePanel) setActivePanel(null);
    } else if (!availableTabs.some((tab) => tab.id === activePanel)) {
      setActivePanel(defaultTabId);
    }
  }, [activePanel, availableTabs, defaultTabId, setActivePanel]);

  if (!isVisible || !activePanel) return null;

  const legacyRendererId = activePanel.startsWith("legacy:")
    ? activePanel.slice("legacy:".length)
    : null;
  const legacyRenderer = legacyRendererId
    ? legacyRenderers.get(legacyRendererId)
    : null;
  const content = legacyRenderer ?? (
    <PanelRenderer id={`${id}:${activePanel}`} name={activePanel} />
  );

  const area = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {availableTabs.length > 1 && (
        <PanelAreaTabs>
          {availableTabs.map((tab) => {
            const rendererId = tab.id.startsWith("legacy:")
              ? tab.id.slice("legacy:".length)
              : null;
            return (
              <PanelAreaTab
                key={tab.id}
                $active={activePanel === tab.id}
                onClick={() =>
                  rendererId
                    ? selectLegacyRenderer(rendererId)
                    : openPanel(tab.id)
                }
                title={tab.label}
                type="button"
              >
                {tab.label}
              </PanelAreaTab>
            );
          })}
        </PanelAreaTabs>
      )}
      <Box sx={{ flex: 1, minHeight: 0 }}>{content}</Box>
    </Box>
  );

  if (!resize) return area;

  return (
    <Resizable
      size={{ height: "100%", width }}
      minWidth={minWidth ?? DEFAULT_MIN_WIDTH}
      maxWidth={maxWidth ?? DEFAULT_MAX_WIDTH}
      direction={direction}
      onResizeStop={(_, __, ___, { width: delta }) => {
        setWidth((currentWidth) => currentWidth + delta);
      }}
      onResizeReset={() => {
        setWidth(computedDefaultWidth);
      }}
    >
      {area}
    </Resizable>
  );
}
