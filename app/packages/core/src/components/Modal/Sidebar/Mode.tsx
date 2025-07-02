import { useTheme } from "@fiftyone/components";
import { ANNOTATE, EXPLORE, modalMode } from "@fiftyone/state";
import { useAtom } from "jotai";
import React from "react";
import styled from "styled-components";

const Container = styled.div`
  padding: 1rem;
  width: 100%;
`;

const Items = styled.div`
  display: flex;
  position: relative;
  border: 1px solid ${({ theme }) => theme.background.level1};
  border-radius: 3px;
  width: 100%;
`;

const Item = styled.div`
  cursor: pointer;
  width: 50%;
  text-align: center;
`;

const Mode = () => {
  const [mode, setMode] = useAtom(modalMode);
  const theme = useTheme();
  const background = { background: theme.background.level1 };
  const text = { color: theme.text.secondary };

  return (
    <Container>
      <Items>
        <Item
          style={mode === EXPLORE ? background : text}
          onClick={() => setMode(EXPLORE)}
        >
          Explore
        </Item>
        <Item
          style={mode === ANNOTATE ? background : text}
          onClick={() => setMode(ANNOTATE)}
        >
          Annotate
        </Item>
      </Items>
    </Container>
  );
};

export default Mode;
