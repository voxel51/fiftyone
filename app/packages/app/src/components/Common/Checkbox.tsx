import React from "react";
import { Checkbox as MaterialCheckbox } from "@material-ui/core";
import { animated } from "react-spring";
import styled from "styled-components";

import { useHighlightHover } from "../Actions/utils";
import { ItemAction } from "../Actions/ItemAction";
import { useTheme } from "../../utils/hooks";
import { summarizeLongStr } from "../../utils/generic";

interface CheckboxProps {
  color?: string;
  name: string;
  value: boolean;
  setValue: (value: boolean) => void;
  count: number;
  subCount: number;
}

const StyledCheckboxContainer = styled.div`
  margin: 0 -0.5rem 0 -0.5rem;
`;

const StyledCheckbox = animated(styled(ItemAction)`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  flex-wrap: nowrap;
  margin: 0;
`);

const CheckboxName = styled.div`
  text-overflow: ellipsis;
  font-weight: bold;
  flex-grow: 1;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  justify-content: space-between;
`;

const makeCountStr = (count, subCount) => {
  if (subCount !== count) {
    return `${subCount.toLocaleString()} of ${count.toLocaleString()}`;
  }

  return count.toLocalString();
};

const Checkbox = React.memo(
  ({ color, name, value, setValue, subCount, count }: CheckboxProps) => {
    const theme = useTheme();
    color = color ?? theme.brand;
    const props = useHighlightHover(false);

    const text = name === null ? "None" : name;
    const countStr = makeCountStr(subCount, count);

    return (
      <StyledCheckboxContainer title={name}>
        <StyledCheckbox {...props} onClick={() => setValue(!value)}>
          <MaterialCheckbox
            checked={value}
            title={name === null ? "None" : name}
            style={{ color, padding: "0 0.5rem 0 0" }}
            onChange={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setValue(!value);
            }}
            disableRipple={true}
          />
          <CheckboxName style={name === null ? { color: color } : {}}>
            <span>
              {summarizeLongStr(text, 28 - countStr.length, "middle")}
            </span>
            <span>{countStr}</span>
          </CheckboxName>
        </StyledCheckbox>
      </StyledCheckboxContainer>
    );
  }
);

export default Checkbox;
