import styled from "styled-components";

export const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100000000 !important;
  align-items: center;
  display: flex;
  justify-content: center;
  background-color: ${({ theme }) => theme.neutral.softBg};
`;

type Props = {
  height: number;
  width: number;
};

export const Container = styled.div<Props>`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: start;
  overflow: hidden;
  box-shadow: ${({ theme }) => `0 20px 25px -20px ${theme.background.level1}`};
  width: ${(props) => props.width};
  height: ${(props) => props.height};
`;

export const DraggableContent = styled.div<Props>`
  height: ${(props) => `calc(${props.height}px - 6.5rem)`};
  border-top: 1px solid ${({ theme }) => theme.primary.plainBorder};
  width: 100%;
  display: flex;
  flex-direction: row;
`;

export const Display = styled.div`
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  padding: 1rem;
  flex: 1;
`;

export const DraggableModalTitle = styled.div`
  flex-direction: row;
  display: flex;
  justify-content: space-between;
  width: 100%;
  height: 3rem;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  background-color: ${({ theme }) => theme.background.level2};
  cursor: move;
  font-weight: 600;
`;

export const Text = styled.div`
  font-size: 1.1rem;
  text-transform: uppercase;
  width: 100%;
  display: flex;
  flex-direction: row;
  cursor: pointer;
`;

export const ButtonGroup = styled.div`
  display: flex;
  flex-direction: row;
`;

export const ActionDiv = styled.div`
  position: relative;
`;

export const IconDiv = styled.div`
  margin: auto 0.25rem;
  align-items: center;
`;

export const ControlGroupWrapper = styled.div`
  margin: 0.5rem;
`;

export const SectionWrapper = styled.div`
  margin: 0.5rem 1rem;
`;

export const LabelTitle = styled.div`
  margin: 0;
  padding: 0.5rem 0;
  font-size: 1rem;
  line-height: 2;
  font-weight: bold;
`;

export const ModalActionButtonContainer = styled.div`
  width: "100%";
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  padding: 0.5rem;
  border-top: 1px solid ${({ theme }) => theme.primary.plainBorder};
`;

export const BUTTON_STYLE: React.CSSProperties = {
  margin: "4px",
  height: "2rem",
  flex: 1,
  textAlign: "center",
};

export const LONG_BUTTON_STYLE: React.CSSProperties = {
  margin: "4px",
  height: "2rem",
  textAlign: "center",
  flex: 1,
};

export const FieldTextField = styled.div`
  margin-top: 2rem;
`;

export const FieldColorSquare = styled.div<{ color: string }>`
  position: relative;
  width: 40px;
  height: 40px;
  margin: 5px;
  cursor: pointer;
  background-color: ${(props) => props.color || "#ddd"};
  display: "inline-block";
`;

export const PickerWrapper = styled.div<{ visible: boolean }>`
  position: absolute;
  top: 60px;
  left: 0;
  z-index: 10001;
  visibility: ${(props) => (props.visible ? "visible" : "hidden")};
`;

export const FieldCHILD_STYLE = {
  marginLeft: "2rem",
  marginTop: "-0.25rem",
};

export const SwitchContainer = styled.label`
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;
`;

export const Slider = styled.span`
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.4s;
  border-radius: 34px;

  &:before {
    position: absolute;
    content: "";
    height: 26px;
    width: 26px;
    left: 4px;
    bottom: 4px;
    background-color: ${({ theme }) => theme.background.level1};
    transition: 0.4s;
    border-radius: 50%;
  }
`;
