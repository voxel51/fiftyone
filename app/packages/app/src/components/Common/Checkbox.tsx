import React, { Suspense } from "react";
import { Checkbox as MaterialCheckbox } from "@material-ui/core";
import { animated } from "react-spring";
import styled from "styled-components";

import { useHighlightHover } from "../Actions/utils";
import { ItemAction } from "../Actions/ItemAction";
import { useTheme } from "../../utils/hooks";
import { summarizeLongStr } from "../../utils/generic";
import { getValueString } from "../Filters/utils";
import { RecoilValueReadOnly, useRecoilValue } from "recoil";

interface CheckboxProps {
  color?: string;
  name: number | string | boolean | null | [number, number];
  value: boolean;
  setValue: (value: boolean) => void;
  count?: number;
  subCountAtom?: RecoilValueReadOnly<number>;
  disabled?: boolean;
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

const CheckboxNameDiv = styled.div`
  text-overflow: ellipsis;
  font-weight: bold;
  flex-grow: 1;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  justify-content: space-between;
`;

const makeCountStr = (subCount = null, count = null) => {
  if (subCount === undefined || count === null) {
    return "";
  }

  if (typeof subCount === "number" && subCount !== count) {
    return `${subCount.toLocaleString()} of ${count.toLocaleString()}`;
  }

  return count.toLocaleString();
};

const CheckboxName = ({
  subCountAtom,
  count,
  text,
  color,
}: {
  subCountAtom?: RecoilValueReadOnly<number>;
  count: number;
  text: string;
  color?: string;
}) => {
  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const countStr = makeCountStr(subCount, count);

  return (
    <CheckboxNameDiv>
      <span style={color ? { color } : {}}>
        {summarizeLongStr(text, 28 - countStr.length, "middle")}
      </span>
      {count && <span>{countStr}</span>}
    </CheckboxNameDiv>
  );
};

const Checkbox = React.memo(
  ({
    color,
    name,
    value,
    setValue,
    subCountAtom,
    count,
    disabled,
  }: CheckboxProps) => {
    const theme = useTheme();
    color = color ?? theme.brand;
    const props = useHighlightHover(disabled);
    const [text, coloring] = getValueString(name);

    return (
      <StyledCheckboxContainer title={text}>
        <StyledCheckbox {...props} onClick={() => setValue(!value)}>
          {!disabled && (
            <MaterialCheckbox
              checked={value}
              title={text}
              style={{ color, padding: "0 0.5rem 0 0" }}
              onChange={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setValue(!value);
              }}
              disableRipple={true}
            />
          )}
          <Suspense
            fallback={
              <CheckboxName
                count={count}
                color={coloring ? color : null}
                text={text}
              />
            }
          >
            <CheckboxName
              color={coloring ? color : null}
              count={count}
              subCountAtom={subCountAtom}
              text={text}
            />
          </Suspense>
        </StyledCheckbox>
      </StyledCheckboxContainer>
    );
  }
);

export default Checkbox;
