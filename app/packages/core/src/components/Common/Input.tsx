import { useTheme } from "@fiftyone/components";
import React, { forwardRef, useEffect, useState } from "react";
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

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.danger.plainColor};
  font-size: 12px;
  margin-top: 4px;
`;

interface BaseProps {
  color?: string;
  placeholder?: string;
  onEnter?: () => void;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
  title?: string;
  id?: string;
}
interface InputProps extends BaseProps {
  validator?: (value: string) => boolean;
  setter: (value: string) => void;
  value: string;
}

interface NumberInputProps extends BaseProps {
  validator?: (value: number | string) => boolean;
  setter: (value: number | undefined) => void;
  value: number;
  min?: number;
  max?: number;
  step?: number;
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
        title,
        id = undefined,
      }: InputProps,
      ref
    ) => {
      const theme = useTheme();
      color = color ?? theme.primary.plainColor;

      return (
        <StyledInputContainer
          style={{ borderBottom: `1px solid ${color}`, ...style }}
          key={id ?? ""}
        >
          <StyledInput
            ref={ref}
            placeholder={placeholder}
            data-cy={`input-${id ?? placeholder}`}
            key={id ?? "input"}
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
            style={
              disabled
                ? { color: theme.text.secondary, cursor: "not-allowed" }
                : {}
            }
            disabled={disabled}
            onFocus={(_: React.FocusEvent<HTMLInputElement>) => {
              onFocus && onFocus();
            }}
            onBlur={onBlur}
            title={title}
          />
        </StyledInputContainer>
      );
    }
  )
);

export default Input;

export const NumberInput = React.memo(
  forwardRef(
    (
      {
        color = undefined,
        placeholder,
        min,
        max,
        step,
        validator = () => true,
        setter,
        value,
        disabled = false,
        onEnter,
        onFocus,
        onBlur,
        onKeyDown,
        style,
        title,
      }: NumberInputProps,
      ref
    ) => {
      const theme = useTheme();
      color = color ?? theme.primary.plainColor;
      const display = [null, undefined].includes(value) ? "" : Number(value);
      const [error, setError] = useState<string | null>(null);
      let errorMsg: string[] | string = [];
      if (min || min === 0) {
        errorMsg.push(`Min: ${min}.`);
      }
      if (max || max === 0) {
        errorMsg.push(`Max: ${max}.`);
      }
      errorMsg = errorMsg.join(" ");

      const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        onBlur && onBlur();
        if (validator(e.currentTarget.value)) {
          setError(null);
        } else {
          setError(`Invalid input. ${errorMsg}`);
        }
      };

      useEffect(() => {
        if (validator(value)) {
          setError(null);
        } else {
          setError(`Invalid input. ${errorMsg}`);
        }
      }, [validator, value]);

      return (
        <div>
          <StyledInputContainer
            style={{ borderBottom: `1px solid ${color}`, ...style }}
          >
            <StyledInput
              ref={ref}
              type={"number"}
              min={min}
              max={max}
              step={step}
              placeholder={placeholder}
              data-cy={`input-${placeholder}`}
              value={display}
              onChange={(e: React.FormEvent<HTMLInputElement>) => {
                // allow deleting zero and disable typing 00000
                if (e.currentTarget.value == "") {
                  setter(undefined);
                } else if (Number(e.currentTarget.value) === 0) {
                  if (e.currentTarget.value === "0") {
                    setter(0);
                  } else if (isZeroString(e.currentTarget.value)) {
                    // clear the 0000000 to 0;
                    e.currentTarget.value = "0";
                  } else {
                    setter(Number(e.currentTarget.value));
                  }
                } else if (validator(e.currentTarget.value)) {
                  e.currentTarget.value = String(Number(e.currentTarget.value));
                  setter(Number(e.currentTarget.value));
                }
              }}
              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                e.key === "Enter" && onEnter && onEnter();
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                e.key === "Escape" && e.currentTarget.blur();
                onKeyDown && onKeyDown(e);
              }}
              style={
                disabled
                  ? { color: theme.text.secondary, cursor: "not-allowed" }
                  : {}
              }
              disabled={disabled}
              onFocus={(_: React.FocusEvent<HTMLInputElement>) => {
                onFocus && onFocus();
              }}
              onBlur={handleBlur}
              title={title}
            />
          </StyledInputContainer>
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      );
    }
  )
);

// catches "00" and 00
function isZeroString(input) {
  if (typeof input !== "string") {
    return false;
  }
  const pattern = /^0+$/;
  return pattern.test(input);
}
