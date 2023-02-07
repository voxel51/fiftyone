import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";

function filterChoicesByQuery(query, all) {
  return all.filter(({ label, value, description }) => {
    return (
      label.toLowerCase().includes(query.toLowerCase()) ||
      value.toLowerCase().includes(query.toLowerCase()) ||
      description.toLowerCase().includes(query.toLowerCase())
    );
  });
}

function useOperatorBrowser() {
  const [query, setQuery] = useState(null);
  const [choices, setChoices] = useState([]);

  const allChoices = [
    {
      label: "Hello World",
      value: "hello-world",
      description: "A simple operator that says hello",
    },
    {
      label: "Compute Similarity",
      value: "compute-sim",
      description: "Compute similarity!",
    },
  ];

  useEffect(() => {
    if (query && query.length > 0) {
      setChoices(filterChoicesByQuery(query, allChoices));
    } else {
      setChoices(allChoices);
    }
  }, [query]);

  const onChangeQuery = (query) => {
    console.log("query", query);
    setQuery(query);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const selected =
      choices.find((choice) => choice.selected) || choices[0] || allChoices[0];
    console.log(selected.value);
  };

  const selectNext = useCallback(() => {
    console.log("select next");
    for (let i = 0; i < choices.length; i++) {
      if (choices[i].selected) {
        choices[i].selected = false;
        if (choices[i + 1]) {
          choices[i + 1].selected = true;
        } else {
          choices[0].selected = true;
        }
        setChoices([...choices]);
        return;
      }
      choices[0].selected = true;
      setChoices([...choices]);
    }
  }, [choices]);

  const selectPrevious = useCallback(() => {
    console.log("select prev");
    for (let i = 0; i < choices.length; i++) {
      if (choices[i].selected) {
        choices[i].selected = false;
        if (choices[i - 1]) {
          choices[i - 1].selected = true;
        } else {
          choices[choices.length - 1].selected = true;
        }
        setChoices([...choices]);
        return;
      }
    }
    choices[choices.length - 1].selected = true;
    setChoices([...choices]);
  }, [choices]);

  const onKeyDown = useCallback(
    (e) => {
      console.log("key", e.key);
      switch (e.key) {
        case "ArrowDown":
          selectNext();
          break;
        case "ArrowUp":
          selectPrevious();
          break;
        // case 'Enter':
        //   onSubmit()
        //   break
      }
    },
    [selectNext, selectPrevious, onSubmit]
  );

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onKeyDown]);

  return {
    isVisible: true,
    choices,
    onChangeQuery,
    onSubmit,
    selectNext,
    selectPrevious,
  };
}

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

  return createPortal(
    <BrowserContainer onSubmit={browser.onSubmit} onKeyDown={browser.onKeyDown}>
      <BrowserModal>
        <QueryInput
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
