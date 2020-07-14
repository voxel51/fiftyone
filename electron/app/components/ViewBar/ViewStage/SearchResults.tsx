import React, { useCallback } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

const SearchResultDiv = animated(styled.div`
  border: var(--std-border-radius) solid var(--std-border-color);
  border-radius: var(--std-border-radius);
  background-color: var(--bg);
  cursor: pointer;
  padding-left: 0.5rem;
`);

const SearchResult = React.memo(({ name, handleClick }) => {
  const [props, set] = useSpring(() => ({
    backgroundColor: "var(--bg)",
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

export default ({ results, setResult }) => {
  return (
    <div>
      {results.map((result, i) => (
        <SearchResult key={i} name={result} setResult={setResult} />
      ))}
    </div>
  );
};
