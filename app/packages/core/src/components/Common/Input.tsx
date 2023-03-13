import { useTheme } from "@fiftyone/components";
import React, { forwardRef } from "react";
import styled from "styled-components";

const StyledInputContainer = styled.div`
  font-size: 14px;
  border-bottom: 1px ${({ theme }) => theme.primary.plainColor} solid;
  position: relative;
  margin: 0.5rem 0;
`;

const StyledInput = styled.input`
  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.primary.plainColor};
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
    color: ${({ theme }) => theme.text.secondary};
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
  style?: React.CSSProperties;
}

const Input = React.memo(
  forwardRef(
    (
      {
        color = undefined,
        placeholder,
        validator = () => true,
        setter,
        value,
        disabled = false,
        onEnter,
        onFocus,
        onBlur,
        onKeyDown,
        style,
      }: InputProps,
      ref
    ) => {
      const theme = useTheme();
      color = color ?? theme.primary.plainColor;

      return (
        <StyledInputContainer
          style={{ borderBottom: `1px solid ${color}`, ...style }}
        >
          <StyledInput
            ref={ref}
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
            style={disabled ? { color: theme.text.secondary } : {}}
            disabled={disabled}
            onFocus={(_: React.FocusEvent<HTMLInputElement>) => {
              onFocus && onFocus();
            }}
            onBlur={onBlur}
          />
        </StyledInputContainer>
      );
    }
  )
);

export default Input;
