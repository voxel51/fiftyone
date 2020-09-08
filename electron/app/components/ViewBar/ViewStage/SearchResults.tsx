import React, { useContext, useLayoutEffect, useEffect, useRef } from "react";
import { animated, config, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";

import { useFollow } from "../../../utils/hooks";

const SearchResultDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem 0.25rem;
  padding: 0.1rem 0.25rem;
  font-weight: bold;
  color: ${({ theme }) => theme.fontDark};
`);

interface SearchResultProps {
  result: string;
  isActive: boolean;
  send: any;
}

const SearchResult = React.memo(({ result, isActive, send, followRef }) => {
  const theme = useContext(ThemeContext);
  const [props, set] = useSpring(() => ({
    backgroundColor: isActive ? theme.backgroundLight : theme.backgroundDark,
    color: isActive ? theme.font : theme.fontDark,
  }));

  useEffect(() => {
    set({
      backgroundColor: isActive ? theme.backgroundLight : theme.backgroundDark,
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
});

const SearchResultsDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  margin-top: 2.5rem;
  position: fixed;
  width: auto;
  z-index: 800;
  padding: 0.5rem 0;

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
  ({ results, send, currentResult, barRef, followRef, bestMatch, ...rest }) => {
    const [props, set] = useSpring(() => {
      const obj = followRef
        ? {
            left: followRef.current.getBoundingClientRect().x,
            top: followRef.current.getBoundingClientRect().y,
          }
        : {};
      return {
        ...obj,
        opacity: 1,
        from: {
          opacity: 0,
        },
        config: config.stiff,
      };
    });

    barRef && followRef && useFollow(barRef, followRef, (obj) => set(obj));

    if (!results.length) return null;

    return (
      <SearchResultsDiv
        style={props}
        onMouseEnter={() => send("MOUSEENTER_RESULTS")}
        onMouseLeave={() => send("MOUSELEAVE_RESULTS")}
        {...rest}
      >
        {results.map((result, i) => (
          <SearchResult
            key={result}
            result={result}
            isActive={currentResult === i || bestMatch === result}
            send={send}
          />
        ))}
      </SearchResultsDiv>
    );
  }
);

export default SearchResults;
