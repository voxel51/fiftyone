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

export const GhostButton = styled.button`
  cursor: pointer;
  background: none;
  border: none;
  margin: 4px;
  margin-left: 8px;
  padding: 0px 12px 4px 12px;
  color: #9e9e9e;
  border-radius: 4px;
  color: #fff;
  transition: background ease 0.25s;
  &:hover {
    background: #454545;
  }
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
  // cursor: ${(props) => (props.active ? "default" : "pointer")};
  cursor: pointer;
  background: ${(props) => (props.active ? "#1a1a1a" : "#2c2c2c")};
  border: none;
  color: #fff;
  padding: 0px 12px 4px 12px;
`;

export const StyleCloseButton = styled.button`
  cursor: pointer;
  border: none;
  padding: 2.5px 6px;
  margin-left: 6px;
  background: none;
  color: #fff;
  border-radius: 4px;
  &:hover {
    background: #454545;
  }
`;
