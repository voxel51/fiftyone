import React from "react";
import { animated, config, useSpring } from "react-spring";
import styled from "styled-components";

import {
  white100 as searchResultsBackgroundColor,
  white59 as searchResultsBorderColor,
  white100a as searchResultsBoxShadowColor,
  grey60 as fontColor,
} from "../../../shared/colors";

const SearchResultDiv = animated(styled.div`
  color: ${fontColor};
  cursor: pointer;
  margin: 0.25rem;
  padding-left: 0.5rem;
`);

interface SearchResultProps {
  result: string;
  isActive: boolean;
  send: any;
}

const SearchResult = React.memo(
  ({ result, isActive, send }: SearchResultProps) => {
    const [props, set] = useSpring(() => ({
      backgroundColor: isActive ? "rgba(108,117,125,0.3)" : "rgb(255,255,255)",
    }));

    const handleMouseEnter = () =>
      set({ backgroundColor: "rgba(108,117,125,0.3)" });

    const handleMouseLeave = () => set({ backgroundColor: "rgb(255,255,255)" });

    const setResult = (e) => send("COMMIT", e.target.dataset.value);

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
  background-color: ${searchResultsBackgroundColor};
  border: 1px solid ${searchResultsBorderColor};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${searchResultsBoxShadowColor};
  box-sizing: border-box;
  font-size: 1rem;
  left: 0;
  letter-spacing: 0;
  margin-top: 0.5rem;
  position: absolute;
  top: 100%;
  width: 100%;
`);

interface SearchResultsProps {
  results: Array<string>;
  send: any;
}

export default ({ results, send }) => {
  if (!results.length) return null;
  return (
    <SearchResultsDiv>
      {results.map((result, i) => (
        <SearchResult
          key={result}
          result={result}
          isActive={false}
          send={() => {}}
        />
      ))}
    </SearchResultsDiv>
  );
};
