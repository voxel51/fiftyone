import React, { useContext } from "react";
import { animated, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";

const SearchResultDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem 0.25rem;
  padding: 0 0.25rem;
`);

interface SearchResultProps {
  result: string;
  isActive: boolean;
  send: any;
}

const SearchResult = React.memo(
  ({ result, isActive, send }: SearchResultProps) => {
    const theme = useContext(ThemeContext);
    const [props, set] = useSpring(() => ({
      backgroundColor: isActive ? theme.backgroundLight : theme.backgroundDark,
      color: isActive ? theme.font : theme.fontDark,
    }));

    const handleMouseEnter = () =>
      set({ backgroundColor: theme.backgroundLight, color: theme.font });

    const handleMouseLeave = () =>
      set({ backgroundColor: theme.backgroundDark, color: theme.fontDark });

    const setResult = (e) =>
      send({ type: "COMMIT", stage: e.target.dataset.result });

    return (
      <SearchResultDiv
        onClick={setResult}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={props}
        data-result={result}
      >
        {result}
      </SearchResultDiv>
    );
  }
);

const SearchResultsDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 2px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  left: 0;
  margin-top: 0.5rem;
  position: absolute;
  top: 100%;
  width: auto;
  z-index: 1000;
`);

interface SearchResultsProps {
  results: Array<string>;
  send: any;
}

export default React.memo(({ results, send }) => {
  if (!results.length) return null;
  return (
    <SearchResultsDiv
      onMouseEnter={() => send("MOUSEENTER_RESULTS")}
      onMouseLeave={() => send("MOUSELEAVE_RESULTS")}
    >
      {results.map((result) => (
        <SearchResult
          key={result}
          result={result}
          isActive={false}
          send={send}
        />
      ))}
    </SearchResultsDiv>
  );
});
