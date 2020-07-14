import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

const SearchResultDiv = animated(styled.div`
  background-color: var(--bg);
  border-radius: var(--std-border-radius);
  cursor: pointer;
  margin: 0.25rem;
  padding-left: 0.5rem;
`);

const SearchResult = React.memo(({ name, handleClick, isActive }) => {
  const [props, set] = useSpring(() => ({
    backgroundColor: isActive ? "var(--bg-darkest)" : "var(--bg)",
  }));

  const handleMouseEnter = () => set({ backgroundColor: "var(--bg-darkest)" });

  const handleMouseLeave = () => set({ backgroundColor: "var(--bg)" });

  return (
    <SearchResultDiv
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={props}
    >
      {name}
    </SearchResultDiv>
  );
});

const SearchResultsDiv = animated(styled.div`
  border: var(--std-border-radius) solid var(--std-border-color);
  border-radius: var(--std-border-radius);
  box-sizing: border-box;
  left: 0;
  position: absolute;
  top: 100%;
  width: 100%;
`);

export default ({ results, setResult }) => {
  return (
    <SearchResultsDiv>
      {results.map((result, i) => (
        <SearchResult key={i} name={result} handleClick={() => {}} />
      ))}
    </SearchResultsDiv>
  );
};
