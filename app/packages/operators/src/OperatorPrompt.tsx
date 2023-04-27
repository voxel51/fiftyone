import { createPortal } from "react-dom";
import { useEffect } from "react";
import styled from "styled-components";
import { Button } from "@fiftyone/components";
import {
  showOperatorPromptSelector,
  useOperatorPrompt,
  useShowOperatorIO,
} from "./state";
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
import { useRecoilValue } from "recoil";
import OperatorIO from "./OperatorIO";
import { Box } from "@mui/material";
import { scrollbarStyles } from "@fiftyone/utilities";

const PromptContainer = styled.div`
  position: absolute;
  top: 5rem;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  z-index: 999;
`;

const PromptModal = styled.div`
  align-self: stretch;
  background: ${({ theme }) => theme.background.level2};
  max-width: 90vw;
  min-width: 50%;
  width: auto;
  padding: 1rem;
  max-height: calc(80vh);
  overflow: auto;
  ${scrollbarStyles}
`;

const Form = styled.div``;

const FieldContainer = styled.div``;

const ButtonsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export default function OperatorPrompt() {
  const show = useRecoilValue(showOperatorPromptSelector);
  if (show) {
    return <ActualOperatorPrompt />;
  } else {
    return null;
  }
}

function ActualOperatorPrompt() {
  const operatorPrompt = useOperatorPrompt();

  return createPortal(
    <PromptContainer>
      <PromptModal ref={operatorPrompt.containerRef}>
        {operatorPrompt.showPrompt && (
          <Prompting operatorPrompt={operatorPrompt} />
        )}
        {operatorPrompt.isExecuting && <div>Executing...</div>}
        {operatorPrompt.hasResultOrError && (
          <Results
            operatorPrompt={operatorPrompt}
            outputFields={operatorPrompt.outputFields}
          />
        )}
      </PromptModal>
    </PromptContainer>,
    document.body
  );
}

function Prompting({ operatorPrompt }) {
  return (
    <Box>
      <Box sx={{ pb: 2 }}>
        <form onSubmit={operatorPrompt.onSubmit}>
          <OperatorIO
            schema={operatorPrompt.inputFields}
            onChange={(data) => {
              const formData = data;
              for (const field in formData) {
                operatorPrompt.setFieldValue(field, formData[field]);
              }
            }}
            data={operatorPrompt.promptingOperator.params}
            errors={operatorPrompt?.validationErrors || []}
          />
        </form>
      </Box>
      <ButtonsContainer>
        <Button onClick={operatorPrompt.cancel} style={{ marginRight: "8px" }}>
          Cancel
        </Button>
        <Button onClick={operatorPrompt.execute}>Execute</Button>
      </ButtonsContainer>
    </Box>
  );
}

export function OperatorViewModal() {
  const io = useShowOperatorIO();
  if (!io.visible) return null;

  return createPortal(
    <PromptContainer>
      <PromptModal>
        <Box>
          <Box sx={{ pb: 2 }}>
            <OperatorIO
              schema={io.schema}
              data={io.data || {}}
              type={io.type}
            />
          </Box>
          {/* {io.showButtons && (
            <ButtonsContainer>
              <Button onClick={operatorPrompt.cancel} style={{ marginRight: "8px" }}>
                Cancel
              </Button>
              <Button onClick={operatorPrompt.execute}>Execute</Button>
            </ButtonsContainer>
          )}  */}
        </Box>
      </PromptModal>
    </PromptContainer>,
    document.body
  );
}

function Results({ operatorPrompt, outputFields }) {
  console.log({ operatorPrompt, outputFields });
  if (!outputFields) return null;
  const { result } = operatorPrompt.executor;
  return (
    <Box>
      <OperatorIO
        type="output"
        data={result}
        schema={operatorPrompt.outputFields}
        onChange={() => {}}
      />
      <ButtonsContainer>
        <Button onClick={() => operatorPrompt.close()}>Close</Button>
      </ButtonsContainer>
    </Box>
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
    case types.List:
      return List;
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
        defaultChecked={defaultValue || field.default}
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
          row
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

function List({ field, onChange, defaultValue, readOnly }) {
  const [value, setValue] = React.useState(field.default || []);

  function setByIndex(index, newValue) {
    setValue((oldValue) => {
      const newValue = [...oldValue];
      newValue[index] = newValue;
      return newValue;
    });
  }

  useEffect(() => {
    if (onChange) onChange({ target: { value } });
  }, [value]);

  return (
    <FormControl component="fieldset" style={{ marginBottom: "1rem" }}>
      <FormLabel component="legend">{field.label}</FormLabel>
      <GenericFieldValue
        field={{ ...field, type: field.type.elementType }}
        onChange={(e) => setByIndex(0, e.target.value)}
      />
    </FormControl>
  );
}
