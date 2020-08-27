import React, { useContext, useEffect } from "react";
import { animated, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";

const SearchResultDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem 0.25rem;
  padding: 0 0.25rem;
  font-weight: bold;
  color: ${({ theme }) => theme.fontDark};
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

    useEffect(() => {
      set({
        backgroundColor: isActive
          ? theme.backgroundLight
          : theme.backgroundDark,
        color: isActive ? theme.font : theme.fontDark,
      });
    }, [isActive]);

    const handleMouseEnter = () =>
      set({ backgroundColor: theme.backgroundLight, color: theme.font });

    const handleMouseLeave = () =>
      set({ backgroundColor: theme.backgroundDark, color: theme.fontDark });

    const setResult = (e) =>
      send({ type: "COMMIT", value: e.target.dataset.result });

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
  background: ${({ theme }) => theme.backgroundDark};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border: 1px solid #191c1f;
  border-radius: 2px;
  box-sizing: border-box;
  margin-top: 2.5rem;
  position: fixed;
  width: auto;
  z-index: 800;

  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`);

interface SearchResultsProps {
  results: Array<string>;
  send: any;
}

const SearchResults = React.memo(
  ({ results, send, currentResult, ...rest }) => {
    if (!results.length) return null;
    return (
      <SearchResultsDiv
        onMouseEnter={() => send("MOUSEENTER_RESULTS")}
        onMouseLeave={() => send("MOUSELEAVE_RESULTS")}
        {...rest}
      >
        {results.map((result, i) => (
          <SearchResult
            key={result}
            result={result}
            isActive={currentResult === i}
            send={send}
          />
        ))}
      </SearchResultsDiv>
    );
  }
);

export default SearchResults;
