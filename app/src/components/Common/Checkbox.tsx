import React from "react";
import { RecoilState, useRecoilState } from "recoil";
import styled from "styled-components";

interface CheckboxProps {
  color?: string;
  name: string;
  valueAtom: RecoilState<boolean>;
}

const StyledCheckbox = styled.div`
  width: 100%;
`;

const Checkbox = React.memo(({ color, valueAtom }: CheckboxProps) => {
  const [value, setValue] = useRecoilState(valueAtom);

  return null;
});

export default Checkbox;
