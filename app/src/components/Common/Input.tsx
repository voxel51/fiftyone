import React from "react";
import { RecoilState, useRecoilState } from "recoil";
import styled from "styled-components";

import { useTheme } from "../../utils/hooks";

interface InputProps {
  color?: string;
  placeholder?: string;
  type: "int" | "float" | "string";
  valueAtom: RecoilState<any>;
}

const StyledInputContainer = styled.div`
  font-size: 14px;
  border-bottom: 1px ${({ theme }) => theme.brand} solid;
  position: relative;
  margin: 0.5rem 0;
`;

const StyledInput = styled.input`
  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.font};
  height: 2rem;
  font-size: 14px;
  border: none;
  align-items: center;
  font-weight: bold;
  width: 100%;

  &:focus {
    border: none;
    outline: none;
    font-weight: bold;
  }

  &::placeholder {
    color: ${({ theme }) => theme.fontDark};
    font-weight: bold;
  }
`;

const Input = React.memo(
  ({ color = null, placeholder, type, valueAtom }: InputProps) => {
    const theme = useTheme();
    const [value, setValue] = useRecoilState(valueAtom);
    color = color ?? theme.brand;

    return (
      <StyledInputContainer style={{ borderBottom: `1px solid ${color}` }}>
        <StyledInput
          placeholder={placeholder}
          value={value === null ? "" : String(value)}
          onChange={(e: React.FormEvent<HTMLInputElement>) => {
            const re = /^[0-9\b]+$/;
            if (
              e.currentTarget.value === "" ||
              re.test(e.currentTarget.value)
            ) {
              setValue(e.currentTarget.value);
            }
          }}
        />
      </StyledInputContainer>
    );
  }
);

export default Input;
