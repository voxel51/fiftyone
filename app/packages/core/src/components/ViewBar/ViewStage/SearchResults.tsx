import { useTheme } from "@fiftyone/components";
import React, { useEffect, useRef } from "react";
import { animated, config, useSpring } from "@react-spring/web";
import styled from "styled-components";

import { useFollow } from "@fiftyone/state";

const SearchResultDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem 0.25rem;
  padding: 0.1rem 0.25rem;
  font-weight: bold;
  color: ${({ theme }) => theme.text.secondary};
`);

interface SearchResultProps {
  result: string;
  isActive: boolean;
  send: any;
  highlight?: string;
}

const SearchResult = React.memo(
  ({ result, isActive, send, highlight }: SearchResultProps) => {
    const ref = useRef(null);
    const theme = useTheme();
    const [props, set] = useSpring(() => ({
      backgroundColor: isActive
        ? theme.background.level1
        : theme.background.level2,
      color: isActive ? theme.text.primary : theme.text.secondary,
    }));

    useEffect(() => {
      set({
        backgroundColor: isActive
          ? theme.background.level1
          : theme.background.level2,
        color: isActive ? theme.text.primary : theme.text.secondary,
      });
      isActive && ref.current && ref.current.scrollIntoView();
    }, [isActive, ref.current]);

    const handleMouseEnter = () =>
      set({
        backgroundColor: theme.background.level1,
        color: theme.text.primary,
      });

    const handleMouseLeave = () =>
      !isActive &&
      set({
        backgroundColor: theme.background.level2,
        color: theme.text.secondary,
      });

    const setResult = (e) =>
      send({ type: "COMMIT", value: e.target.dataset.result, click: true });

    return (
      <SearchResultDiv
        ref={ref}
        onClick={setResult}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={props}
        data-result={result}
      >
        {[null, undefined].includes(result) ? (
          <code style={{ color: highlight }}>None</code>
        ) : (
          result
        )}
      </SearchResultDiv>
    );
  }
);

const SearchResultsDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.custom.shadow};
  box-sizing: border-box;
  margin-top: 2.5rem;
  position: fixed;
  width: auto;
  z-index: 801;
  max-height: 328px;
  overflow-y: scroll;
  scrollbar-width: none;

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

type SearchResultsProps = {
  results: Array<string>;
  send: any;
  highlight?: string;
};

const SearchResults = React.memo(
  ({
    results,
    send,
    currentResult,
    barRef,
    followRef,
    bestMatch,
    highlight,
    ...rest
  }: SearchResultsProps) => {
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

    useFollow(barRef, followRef, set);

    if (!results.length) return null;

    return (
      <SearchResultsDiv
        style={props}
        onMouseEnter={() => send("MOUSEENTER")}
        onMouseLeave={() => send("MOUSELEAVE")}
        {...rest}
      >
        {results.map((result, i) => (
          <SearchResult
            key={result}
            result={result}
            isActive={currentResult === i || bestMatch === result}
            send={send}
            highlight={highlight}
          />
        ))}
      </SearchResultsDiv>
    );
  }
);

export default SearchResults;
