import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { Button } from "@fiftyone/components";
import { useOperatorPrompt } from "./state";
import * as types from "./types";
import {
  FormControl,
  FormControlLabel,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
} from "@mui/material";

const PromptContainer = styled.div`
  position: absolute;
  top: 5rem;
  left: 0;
  // height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
`;

const PromptModal = styled.div`
  align-self: stretch;
  background: ${({ theme }) => theme.background.level2};
  width: 50%;
  padding: 1rem;
`;

const Form = styled.div``;

const FieldContainer = styled.div``;

const ButtonsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export default function OperatorPrompt() {
  const operatorPrompt = useOperatorPrompt();

  if (!operatorPrompt) return null;

  return createPortal(
    <PromptContainer>
      <PromptModal>
        {operatorPrompt.showPrompt && (
          <Prompting operatorPrompt={operatorPrompt} />
        )}
        {operatorPrompt.isExecuting && <div>Executing...</div>}
        {operatorPrompt.hasResultOrError && (
          <Results operatorPrompt={operatorPrompt} />
        )}
      </PromptModal>
    </PromptContainer>,
    document.body
  );
}

function Prompting({ operatorPrompt }) {
  return (
    <>
      <Form>
        {operatorPrompt.inputFields.map((field) => (
          <Field
            key={field.name}
            field={field}
            onChange={(e) =>
              operatorPrompt.setFieldValue(field.name, e.target.value)
            }
          />
        ))}
      </Form>
      <ButtonsContainer>
        <Button
          onClick={(e) => {
            operatorPrompt.cancel();
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => {
            operatorPrompt.execute();
          }}
        >
          Execute
        </Button>
      </ButtonsContainer>
    </>
  );
}

function Results({ operatorPrompt }) {
  console.log(operatorPrompt);
  return (
    <>
      <h3>Result</h3>
      {operatorPrompt?.executor?.result &&
        operatorPrompt.outputFields.map((field) => (
          <Field
            key={field.name}
            field={field}
            readOnly={true}
            defaultValue={operatorPrompt.executor.result.result[field.name]}
          />
        ))}
      <ButtonsContainer>
        <Button onClick={() => operatorPrompt.close()}>Close</Button>
      </ButtonsContainer>
    </>
  );
}

function Field({ field, defaultValue, readOnly, onChange }) {
  return (
    <FieldContainer>
      <GenericFieldValue {...{ defaultValue, field, readOnly, onChange }} />
    </FieldContainer>
  );
}

function getComponentForType(type: types.ANY_TYPE) {
  const TYPE = types.TYPES.find((t) => type instanceof t);
  switch (TYPE) {
    case types.String:
      return TextInput;
    case types.Number:
      return NumberInput;
    case types.Boolean:
      return Checkbox;
    case types.Enum:
      return Emum;
    default:
      null;
  }
}

function GenericFieldValue(props) {
  const { field } = props;
  const Component = getComponentForType(field.type);
  if (!Component)
    return (
      <h4>
        No component for {field.name} ({field.type.name})
      </h4>
    );

  return <Component {...props} />;
}

const Label = styled.label`
  display: block;
  margin: 0 0 0.5rem 0.5rem;
`;

const StyledInput = styled.input<{ error?: string }>`
  width: 100%;
  margin: 0 0 1rem 0;
  border-radius: 4px;
  border: 1px solid
    ${({ theme, error }) =>
      error ? theme.error.main : theme.primary.plainBorder};
  padding: 0.5rem;
  color: ${({ theme }) => theme.text.primary};
  background: ${({ theme }) => theme.background.level3};
  font-family: "Palanquin", sans-serif;

  &:focus {
    border: 1px solid ${({ theme }) => theme.primary.plainBorder};
    outline: none;
  }
`;

function TextInput({ field, defaultValue, readOnly, onChange }) {
  return (
    <>
      <Label>{field.label}</Label>
      <StyledInput
        autoFocus
        error={field.error}
        type="text"
        defaultValue={defaultValue || field.default}
        readOnly={readOnly}
        onChange={onChange}
      />
    </>
  );
}

function NumberInput({ field, onChange, defaultValue, readOnly }) {
  return (
    <>
      <Label>{field.label}</Label>
      <StyledInput
        autoFocus
        error={field.error}
        type="number"
        defaultValue={defaultValue || field.default}
        readOnly={readOnly}
        onChange={onChange}
      />
    </>
  );
}

const CheckboxContainer = styled.div`
  display: flex;
  input {
    width: auto;
    position: relative;
    top: 6px;
  }
`;

function Checkbox({ field, onChange, defaultValue, readOnly }) {
  return (
    <CheckboxContainer>
      <StyledInput
        autoFocus
        error={field.error}
        type="checkbox"
        defaultValue={defaultValue || field.default}
        readOnly={readOnly}
        onChange={onChange}
      />
      <Label>{field.label}</Label>
    </CheckboxContainer>
  );
}

function Emum({ field, onChange, defaultValue, readOnly }) {
  const [value, setValue] = React.useState(defaultValue || field.default);

  useEffect(() => {
    if (onChange) onChange({ target: { value } });
  }, [value]);
  if (field.type.values.length < 6) {
    return (
      <FormControl component="fieldset" style={{ marginBottom: "1rem" }}>
        <FormLabel component="legend">{field.label}</FormLabel>
        <RadioGroup
          aria-label="gender"
          name={field.name}
          value={value}
          onChange={(e, newValue) => setValue(newValue)}
        >
          {field.type.values.map((v) => (
            <FormControlLabel value={v} control={<Radio />} label={v} />
          ))}
        </RadioGroup>
      </FormControl>
    );
  } else {
    console.log(field);
    return (
      <FormControl fullWidth style={{ marginBottom: "1rem" }}>
        <InputLabel>{field.label}</InputLabel>
        <Select
          labelId={field.name}
          value={value}
          label={field.label}
          onChange={(e) => setValue(e.target.value)}
        >
          {field.type.values.map((v) => (
            <MenuItem value={v}>{v}</MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }
}
