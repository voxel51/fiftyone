import { useTheme } from "@fiftyone/components";
import { Radio as MaterialRadio } from "@mui/material";
import { animated } from "@react-spring/web";
import React, { useLayoutEffect } from "react";
import styled from "styled-components";
import { ItemAction } from "../Actions/ItemAction";
import { useHighlightHover } from "../Actions/utils";

const StyledRadioContainer = styled.div``;

const StyledRadio = animated(styled(ItemAction)`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  margin: 0;
`);

const RadioName = styled.div`
  text-overflow: ellipses;
  font-weight: bold;
  flex-grow: 1;
`;

interface RadioProps<T extends string> {
  color?: string;
  setValue: (value: T) => void;
  value: T;
  currentValue: T;
}

const Radio = <T extends string>({
  color,
  currentValue,
  setValue,
  value,
}: RadioProps<T>) => {
  const props = useHighlightHover(false);
  return (
    <StyledRadioContainer>
      <StyledRadio
        {...props}
        onClick={() => setValue(value)}
        data-cy={`radio-button-${value}`}
      >
        <MaterialRadio
          style={{ color, padding: "0 0.5rem 0 0" }}
          checked={value === currentValue}
        />
        <RadioName>{value}</RadioName>
      </StyledRadio>
    </StyledRadioContainer>
  );
};

type Props = {
  horizontal: boolean;
};
const RadioGroupContainer = styled.div<Props>`
  overflow: auto visible;
  max-height: 165px;
  margin: 0 -0.5rem;
  scrollbar-width: none;
  display: flex;
  flex-direction: ${(props) => (props.horizontal ? "row" : "column")};

  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`;

interface RadioGroupProps<T extends string> {
  choices: T[];
  setValue: (value: T) => void;
  value: T;
  color?: string;
  horizontal?: boolean;
}

const RadioGroup = React.memo(
  <T extends string>({
    choices,
    color,
    value,
    setValue,
    horizontal = false,
  }: RadioGroupProps<T>) => {
    const theme = useTheme();
    color = color ?? theme.primary.plainColor;

    useLayoutEffect(() => {
      choices.length >= 1 && !value && setValue(choices[0]);
    }, [value, choices]);

    if (!value) {
      return null;
    }

    return (
      <RadioGroupContainer horizontal={horizontal}>
        {choices.map((choice) => (
          <Radio
            value={choice}
            setValue={setValue}
            color={color}
            currentValue={value}
            key={choice}
          />
        ))}
      </RadioGroupContainer>
    );
  }
);

export default RadioGroup;
