import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";
import { send } from "xstate";

const SearchResultDiv = animated(styled.div`
  background-color: var(--bg);
  border-radius: var(--std-border-radius);
  cursor: pointer;
  margin: 0.25rem;
  padding-left: 0.5rem;
`);

const SearchResult = React.memo(({ value, isActive, send }) => {
  const [props, set] = useSpring(() => ({
    backgroundColor: isActive ? "var(--bg-darkest)" : "var(--bg)",
  }));

  const handleMouseEnter = () => set({ backgroundColor: "var(--bg-darkest)" });

  const handleMouseLeave = () => set({ backgroundColor: "var(--bg)" });

  const setResult = (e) => send("COMMIT", e.target.dataset.value);

  return (
    <SearchResultDiv
      onClick={setResult}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={props}
      data-value={value}
    >
      {value}
    </SearchResultDiv>
  );
});

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

export default ({ results, send }) => {
  if (!results.length) return null;
  return (
    <SearchResultsDiv>
      {results.map((result, i) => (
        <SearchResult key={i} value={result} />
      ))}
    </SearchResultsDiv>
  );
};
