import { Button } from "@fiftyone/components";
import { DeleteOutline } from "@mui/icons-material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React from "react";
import styled from "styled-components";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import ioSchema from "../../../../../plugins/SchemaIO/examples/input.json";
import { Redo, RoundButton, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import { ICONS } from "../Icons";
import { fieldType, schemaConfig } from "../state";
import { current, editing } from "./state";
import useMove from "./useMove";

const Row = styled.div`
  align-items: center;
  color: ${({ theme }) => theme.text.secondary};
  display: flex;
  justify-content: space-between;
  margin: 0.5rem -1rem;
  padding: 0 0.5rem;
`;

const ContentContainer = styled.div`
  margin: 0.25rem 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const Content = styled.div`
  background: ${({ theme }) => theme.neutral.softBg};
  border-radius: 3px;
  width: 100%;
  flex: 1;
  padding: 1rem;
  overflow: auto;
`;

const Header = () => {
  const [label, setLabel] = useAtom(current);
  const type = useAtomValue(fieldType(label.path));

  const Icon = ICONS[type] ?? ICONS;
  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Icon fill="white" />
        <div>{label.path}</div>
      </ItemLeft>
      <ItemRight>
        <Undo />
        <Redo />
      </ItemRight>
    </Row>
  );
};

const Footer = () => {
  const setEditing = useSetAtom(editing);
  return (
    <Row>
      <RoundButton>
        <DeleteOutline /> Delete
      </RoundButton>

      <Button onClick={() => setEditing(null)}>Done</Button>
    </Row>
  );
};

export default function Edit() {
  const [label, setLabel] = useAtom(current);
  const config = useAtomValue(schemaConfig(label.path));

  useMove();

  return (
    <ContentContainer>
      <Header />
      <Content>
        <SchemaIOComponent
          schema={ioSchema}
          data={{ X: 1 }}
          onChange={(...args) => {
            console.log(args);
          }}
        />
      </Content>
      <Footer />
    </ContentContainer>
  );
}
