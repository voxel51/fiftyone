import React, { useContext, useLayoutEffect, useEffect, useRef } from "react";
import { animated, config, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";

const SearchResultDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem 0.25rem;
  padding: 0.1rem 0.25rem;
  font-weight: bold;
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
});

const SearchResultsDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 2px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  margin-top: 2.5rem;
  position: fixed;
  width: auto;
  z-index: 800;
  padding: 0.5rem 0;
`);

interface SearchResultsProps {
  results: Array<string>;
  send: any;
}

const SearchResults = React.memo(
  ({ results, send, currentResult, barRef, followRef }) => {
    const [props, set] = useSpring(() => ({
      left: 0,
      opacity: 1,
      from: {
        opacity: 0,
      },
      config: config.stiff,
    }));

    useLayoutEffect(() => {
      console.log("effec", barRef.current, followRef.current);
      const follow = () => {
        console.log("follow");
        const { x } = followRef.current.getBoundingClientRect();
        const {
          x: barX,
          width: barWidth,
        } = barRef.current.getBoundingClientRect();
        set({
          left: x,
          opacity: x - barX < 0 || x > barX + barWidth ? 0 : 1,
        });
      };
      barRef.current && barRef.current.addEventListener("scroll", follow);

      barRef.current && followRef.current && follow();
      return () =>
        barRef.current && barRef.current.removeEventListener("scroll", follow);
    }, [barRef.current, followRef.current]);
    if (!results.length) return null;

    return (
      <SearchResultsDiv
        style={props}
        onMouseEnter={() => send("MOUSEENTER_RESULTS")}
        onMouseLeave={() => send("MOUSELEAVE_RESULTS")}
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
