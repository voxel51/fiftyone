import React from "react";
import { Checkbox as MaterialCheckbox } from "@material-ui/core";
import { RecoilState, useRecoilState } from "recoil";
import styled from "styled-components";

interface CheckboxProps {
  color?: string;
  name: string;
  valueAtom: RecoilState<boolean>;
}

const StyledCheckbox = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
`;

const Checkbox = React.memo(({ color, name, valueAtom }: CheckboxProps) => {
  const [value, setValue] = useRecoilState(valueAtom);

  return (
    <StyledCheckbox>
      <MaterialCheckbox checked={value} title={name} />
      <div>{name}</div>
    </StyledCheckbox>
  );
});

export default Checkbox;
