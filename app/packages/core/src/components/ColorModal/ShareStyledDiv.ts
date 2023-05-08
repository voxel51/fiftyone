import styled from "styled-components";

type ContainerProp = {
  height: string;
  width: string;
  minWidth: string;
};

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

export const Container = styled.div<ContainerProp>`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: start;
  overflow: hidden;
  box-shadow: ${({ theme }) => `0 20px 25px -20px ${theme.background.level1}`};
  min-width: ${({ minWidth }) => minWidth};
  width: ${({ width }) => width};
  height: ${({ height }) => height};
`;

export const DraggableContent = styled.div<ContainerProp>`
  height: ${({ height }) => `calc(${height} - 6rem)`};
  overflow: auto;
`;

export const DraggableModalTitle = styled.div`
  flex-direction: row;
  display: flex;
  justify-content: space-between;
  width: 100%;
  height: 2.5rem;
  background-color: ${({ theme }) => theme.background.level1};
  padding: 2px;
  cursor: pointer;
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
  margin: 0.5rem 2rem;
`;

export const SectionWrapper = styled.div`
  margin: 0.5rem 1rem;
`;

export const LabelTitle = styled.div`
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
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
    background-color: white;
    transition: 0.4s;
    border-radius: 50%;
  }
`;
