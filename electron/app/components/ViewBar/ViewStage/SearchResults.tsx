import React from "react";
import { animated, config, useSpring } from "react-spring";
import styled from "styled-components";

const SearchResultDiv = animated(styled.div`
  background-color: var(--bg);
  border-radius: var(--std-border-radius);
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
      background: isActive ? "#FFF" : "#FFF",
      color: "black",
      config: config.gentle,
    }));

    const handleMouseEnter = () => set({ background: "#000", color: "pink" });

    const handleMouseLeave = () => set({ background: "var(--bg)" });

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
  border: var(--std-border-radius) solid var(--std-border-color);
  border-radius: var(--std-border-radius);
  box-sizing: border-box;
  left: 0;
  margin-top: 0.5rem;
  position: absolute;
  top: 100%;
  width: 100%;
`);

interface SearchResultsProps {
  results: Array<string>;
  send: any;
}

export default ({ results, send }: SearchResultsProps) => {
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
