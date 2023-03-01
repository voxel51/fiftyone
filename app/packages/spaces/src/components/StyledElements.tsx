import styled from "styled-components";

export const SpaceContainer = styled.div`
  width: 100%;
  height: 100%;
`;

export const PanelContainer = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

export const PanelTabs = styled.div`
  display: flex;
  background: var(--joy-palette-background-header);
  padding-bottom: 0px;
`;

export const StyledPanel = styled.div`
  width: 100%;
  height: calc(100% - 28px);
  overflow: auto;
  background: var(--joy-palette-background-mediaSpace);
`;

export const AddPanelButtonContainer = styled.div`
  position: relative;
  margin-left: 4px;
`;

export const StyledPanelItem = styled.div`
  cursor: pointer;
  padding: 4px 8px;

  &:hover {
    background: var(--joy-palette-background-body);
  }
`;

export const StyledTab = styled.button<{ active?: boolean }>`
  display: flex;
  align-items: center;
  cursor: pointer;
  background: ${(props) =>
    props.active
      ? "var(--joy-palette-background-level2)"
      : "var(--joy-palette-background-inactiveTab)"};
  border: none;
  color: ${(props) =>
    props.active
      ? "var(--joy-palette-text-primary)"
      : "var(--joy-palette-text-secondary)"};
  padding: 2px 12px 2px 12px;
  border-right: 1px solid var(--joy-palette-background-level3);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
`;

export const TabIndicatorContainer = styled.div`
  max-height: 24px;
  margin-left: 4px;
`;
