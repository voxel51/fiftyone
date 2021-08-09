import React from "react";
import styled from "styled-components";

import { useTheme } from "../../utils/hooks";

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

interface InputProps {
  color?: string;
  placeholder?: string;
  validator?: (value: string) => boolean;
  setter: (value: string) => void;
  value: string;
  onEnter?: () => void;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const Input = React.memo(
  ({
    color = null,
    placeholder,
    validator = () => true,
    setter,
    value,
    disabled = false,
    onEnter,
    onFocus,
    onBlur,
    onKeyDown,
  }: InputProps) => {
    const theme = useTheme();
    color = color ?? theme.brand;

    return (
      <StyledInputContainer style={{ borderBottom: `1px solid ${color}` }}>
        <StyledInput
          placeholder={placeholder}
          value={value === null ? "" : String(value)}
          onChange={(e: React.FormEvent<HTMLInputElement>) => {
            if (validator(e.currentTarget.value)) {
              setter(e.currentTarget.value);
            }
          }}
          onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
            e.key === "Enter" && onEnter && onEnter();
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            e.key === "Escape" && e.currentTarget.blur();
            onKeyDown && onKeyDown(e);
          }}
          style={disabled ? { color: theme.fontDark } : {}}
          disabled={disabled}
          onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
            onFocus();
          }}
          onBlur={onBlur}
        />
      </StyledInputContainer>
    );
  }
);

export default Input;
