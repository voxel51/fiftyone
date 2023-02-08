import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { Button } from "@fiftyone/components";
import { useOperatorPrompt } from "./state";

const PromptContainer = styled.form`
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
        {operatorPrompt.fields.map((field) => (
          <Field
            field={field}
            onChange={(e) =>
              operatorPrompt.setFieldValue(field.name, e.target.value)
            }
          />
        ))}
      </Form>
      <ButtonsContainer>
        <Button onClick={() => operatorPrompt.cancel()}>Cancel</Button>
        <Button onClick={() => operatorPrompt.execute()}>Execute</Button>
      </ButtonsContainer>
    </>
  );
}

function Results({ operatorPrompt }) {
  return (
    <>
      <h3>Result</h3>
      {operatorPrompt.executor.result &&
        Object.entries(operatorPrompt.executor.result.result).map(
          ([key, value]) => (
            <Field field={{ label: key, default: value, type: typeof value }} />
          )
        )}
      <ButtonsContainer>
        <Button onClick={() => operatorPrompt.close()}>Close</Button>
      </ButtonsContainer>
    </>
  );
}

function Field({ field, onChange }) {
  return (
    <FieldContainer>
      <Label>{field.label}</Label>
      {field.type === "string" && (
        <TextInput field={field} onChange={onChange} />
      )}
    </FieldContainer>
  );
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

function TextInput({ field, onChange }) {
  return (
    <StyledInput
      autoFocus
      error={field.error}
      type="text"
      defaultValue={field.default}
      onChange={onChange}
    />
  );
}
