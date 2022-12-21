import styled from "styled-components";

export const SpaceContainer = styled.div`
  width: 100%;
  height: 100%;
`;

export const PanelContainer = styled.div`
  width: 100%;
  height: 100%;
`;

export const PanelTabs = styled.div`
  display: flex;
  background: var(--joy-palette-background-header);
  padding-bottom: 0px;
`;

export const StyledPanel = styled.div`
  width: 100%;
  height: calc(100% - 37px);
  overflow: auto;
`;

export const AddPanelButtonContainer = styled.div`
  position: relative;
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
      : "var(--joy-palette-background-button)"};
  border: none;
  color: ${(props) =>
    props.active
      ? "var(--joy-palette-text-primary)"
      : "var(--joy-palette-text-secondary)"};
  padding: 0px 12px 4px 12px;
  border-right: 1px solid var(--joy-palette-background-level3);
`;
