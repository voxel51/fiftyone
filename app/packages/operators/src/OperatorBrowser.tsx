import { createPortal } from "react-dom";
import styled from "styled-components";
import { useOperatorBrowser } from "./state";

const BrowserContainer = styled.form`
  position: absolute;
  top: 5rem;
  left: 0;
  max-height: 80vh;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  z-index: 999;
`;

const BrowserModal = styled.div`
  align-self: stretch;
  background: ${({ theme }) => theme.background.level2};
  width: 50%;
  padding: 1rem;
`;

const ResultsContainer = styled.div`
  margin-top: 1rem;
  max-height: calc(100% - 48px);
  overflow: auto;
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

const ChoiceDescription = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
`;

const ChoiceLabel = styled.div`
  margin-left: auto;
  max-width: 38%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Choice = ({ onClick, choice, selected }) => {
  return (
    <ChoiceContainer onClick={onClick} selected={selected}>
      <ChoiceDescription>
        {choice.description || choice.label}
      </ChoiceDescription>
      {choice.description && <ChoiceLabel>{choice.label}</ChoiceLabel>}
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
            <Choice
              onClick={() => browser.setSelectedAndSubmit(choice.value)}
              key={choice.value}
              choice={choice}
              selected={choice.value === browser.selectedValue}
            />
          ))}
        </ResultsContainer>
      </BrowserModal>
    </BrowserContainer>,
    document.body
  );
}
