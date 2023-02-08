import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { useOperatorBrowser } from "./state";

const BrowserContainer = styled.form`
  position: absolute;
  top: 5rem;
  left: 0;
  // height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
`;

const BrowserModal = styled.div`
  align-self: stretch;
  background: ${({ theme }) => theme.background.level2};
  width: 50%;
  padding: 1rem;
`;

const ResultsContainer = styled.div`
  margin-top: 1rem;
`;

const QueryInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.background.level1};
  outline: none;
  border: solid 1px ${({ theme }) => theme.background.level3};
  padding: 0.5rem 1rem;
`;
const ChoiceContainer = styled.div`
  display: flex;
  height: 2.5rem;
  line-height: 2.5rem;
  padding: 0 1rem;
  :hover {
    background: ${({ theme }) => theme.background.level1};
    cursor: pointer;
  }
  background: ${({ selected, theme }) => selected && theme.primary.plainColor};
`;

const ChoiceDescription = styled.div``;

const ChoiceLabel = styled.div`
  margin-left: auto;
`;

const Choice = ({ choice }) => {
  return (
    <ChoiceContainer selected={choice.selected}>
      <ChoiceDescription>{choice.description}</ChoiceDescription>
      <ChoiceLabel>{choice.label}</ChoiceLabel>
    </ChoiceContainer>
  );
};

export default function OperatorBrowser() {
  const browser = useOperatorBrowser();

  if (!browser.isVisible) {
    return null;
  }

  return createPortal(
    <BrowserContainer onSubmit={browser.onSubmit} onKeyDown={browser.onKeyDown}>
      <BrowserModal>
        <QueryInput
          autoFocus
          placeholder="Search operators by name..."
          onChange={(e) => browser.onChangeQuery(e.target.value)}
        />
        <ResultsContainer>
          {browser.choices.map((choice) => (
            <Choice key={choice.value} choice={choice} />
          ))}
        </ResultsContainer>
      </BrowserModal>
    </BrowserContainer>,
    document.body
  );
}
