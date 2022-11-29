import React, { useMemo } from "react";
import { Checkbox as MaterialCheckbox } from "@mui/material";
import { animated } from "@react-spring/web";
import styled from "styled-components";

import { useHighlightHover } from "../Actions/utils";
import { ItemAction } from "../Actions/ItemAction";
import { getValueString } from "../Filters/utils";
import { constSelector, RecoilValueReadOnly } from "recoil";
import { NameAndCountContainer } from "../utils";
import { SuspenseEntryCounts } from "./CountSubcount";
import { prettify } from "../../utils/generic";
import { useTheme } from "@fiftyone/components";

interface CheckboxProps<T> {
  color?: string;
  name: T;
  value: boolean;
  setValue: (value: boolean) => void;
  count?: number;
  subcountAtom?: RecoilValueReadOnly<number>;
  disabled?: boolean;
  forceColor?: boolean;
  formatter?: (value: T) => string;
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

const Checkbox = <T extends unknown>({
  color,
  name,
  value,
  setValue,
  subcountAtom,
  count,
  disabled,
  forceColor,
  formatter,
}: CheckboxProps<T>) => {
  const theme = useTheme();
  color = color ?? theme.primary.plainColor;
  const props = useHighlightHover(disabled);
  const [text, coloring] = getValueString(formatter ? formatter(name) : name);

  const countAtom =
    typeof count === "number"
      ? useMemo(() => constSelector(count), [count])
      : null;

  return (
    <StyledCheckboxContainer title={text}>
      <StyledCheckbox
        {...props}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          !disabled && setValue(!value);
        }}
      >
        {!disabled && (
          <MaterialCheckbox
            checked={value}
            title={text}
            style={{ color, padding: "0 0.5rem 0 0" }}
            disableRipple={true}
          />
        )}

        <NameAndCountContainer>
          <span style={{ color: coloring || forceColor ? color : "unset" }}>
            {prettify(text)}
          </span>
          {countAtom && (
            <SuspenseEntryCounts
              countAtom={countAtom}
              subcountAtom={subcountAtom}
            />
          )}
        </NameAndCountContainer>
      </StyledCheckbox>
    </StyledCheckboxContainer>
  );
};

export default Checkbox;
