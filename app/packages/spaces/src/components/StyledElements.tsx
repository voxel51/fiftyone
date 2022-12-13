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
  background: #252525;
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
    background: #2b2b2b;
  }
`;

export const StyledTab = styled.button<{ active?: boolean }>`
  display: flex;
  align-items: center;
  cursor: pointer;
  background: ${(props) => (props.active ? "#1a1a1a" : "#2c2c2c")};
  border: none;
  color: #fff;
  padding: 0px 12px 4px 12px;
`;
