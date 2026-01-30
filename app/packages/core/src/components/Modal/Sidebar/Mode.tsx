import { useTheme } from "@fiftyone/components";
import { ANNOTATE, EXPLORE, modalMode } from "@fiftyone/state";
import { useAtom, useAtomValue } from "jotai";
import styled from "styled-components";
import { isEditing } from "./Annotate/Edit";

const Container = styled.div`
  padding: 0.5rem 1rem;
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
  const editing = useAtomValue(isEditing);

  if (editing) {
    return null;
  }

  return (
    <Container>
      <Items>
        <Item
          data-cy={EXPLORE}
          onClick={() => setMode(EXPLORE)}
          style={mode === EXPLORE ? background : text}
        >
          Explore
        </Item>
        <Item
          data-cy={ANNOTATE}
          onClick={() => setMode(ANNOTATE)}
          style={mode === ANNOTATE ? background : text}
        >
          Annotate
        </Item>
      </Items>
    </Container>
  );
};

export default Mode;
