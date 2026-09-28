import styled from "styled-components";

export const SpaceContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  --focus-border: var(--fo-palette-neutral-plainColor);
`;

export const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

export const PanelTabs = styled.div<{ $isModal?: boolean }>`
  display: flex;
  background: var(--fo-palette-background-header);
  padding-bottom: 0px;
`;

export const StyledPanel = styled.div<{ $isModalPanel?: boolean }>`
  width: 100%;
  /* fills what the tab row leaves in a PanelContainer; 100% elsewhere */
  height: 100%;
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  background: var(--fo-palette-background-mediaSpace);
`;

export const AddPanelButtonContainer = styled.div`
  position: relative;
  margin-left: 4px;
`;

export const StyledTab = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  cursor: pointer;
  background: ${(props) =>
    props.$active
      ? "var(--fo-palette-background-level2)"
      : "var(--fo-palette-background-inactiveTab)"};
  border: none;
  color: ${(props) =>
    props.$active
      ? "var(--fo-palette-text-primary)"
      : "var(--fo-palette-text-secondary)"};
  padding: 2px 12px 2px 12px;
  border-right: 1px solid var(--fo-palette-background-level3);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
`;

export const TabIndicatorContainer = styled.div`
  max-height: 24px;
  margin-left: 4px;
`;

export const HelpTabIconContainer = styled.div`
  display: flex;
  align-items: center;
  margin-left: 10px;
  padding-top: 4px;
`;
