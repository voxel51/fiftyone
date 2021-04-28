import React from "react";
import { RecoilState, useRecoilState } from "recoil";
import styled from "styled-components";

import { useTheme } from "../../utils/hooks";

interface InputProps {
  color?: string;
  placeholder?: string;
  type: "int" | "float" | "string";
  valueAtom: RecoilState<string>;
}

const StyledInput = styled.input`
  width: 100%;
  font-weight: bold;
`;

const Input = React.memo(
  ({ color = null, placeholder, type, valueAtom }: InputProps) => {
    const theme = useTheme();
    const [value, setValue] = useRecoilState(valueAtom);
    color = color ?? theme.brand;

    return (
      <StyledInput
        style={{ borderBottom: `1px solid ${color}` }}
        placeholder={placeholder}
        value={value}
        onChange={(e: React.FormEvent<HTMLInputElement>) => {
          setValue(e.currentTarget.value);
        }}
      />
    );
  }
);

export default Input;
