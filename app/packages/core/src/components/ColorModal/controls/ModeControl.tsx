import React from "react";
import styled from "styled-components";

import * as fos from "@fiftyone/state";
import { useTheme } from "@fiftyone/components/src/components/ThemeProvider";

export const ModeControlContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
`;

export const SwitchContainer = styled.label`
  position: relative;
  display: inline-block;
  width: 30px;
  height: 15px;
  margin: auto 4px;
`;

export const Slider = styled.span<{ checked: boolean }>`
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${({ checked, theme }) =>
    checked ? theme.voxel["500"] : theme.neutral["200"]};
  transition: 0.4s;
  border-radius: 12px;

  &:before {
    position: absolute;
    content: "";
    height: 10px;
    width: 10px;
    left: ${({ checked }) => (checked ? "calc(100% - 14px)" : "4px")};
    bottom: 2px;
    background-color: white;
    transition: 0.4s;
    border-radius: 50%;
  }
`;

const ModeControl: React.FC = () => {
  const { props } = fos.useSessionColorScheme();
  const checked = Boolean(props.colorBy === "value");
  const theme = useTheme();

  const toggleSwitch = (ev) => {
    props.setColorBy(ev.target.checked ? "value" : "field");
  };
  return (
    <ModeControlContainer>
      <>
        use color by field
        <SwitchContainer onClick={toggleSwitch}>
          <input
            type="checkbox"
            checked={checked}
            onChange={toggleSwitch}
            style={{ display: "none" }}
          />
          <Slider checked={checked} theme={theme} />
        </SwitchContainer>
        value
      </>
    </ModeControlContainer>
  );
};

export default ModeControl;
