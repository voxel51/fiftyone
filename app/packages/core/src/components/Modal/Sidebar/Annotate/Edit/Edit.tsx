import { Button } from "@fiftyone/components";
import { DeleteOutline } from "@mui/icons-material";
import { useAtom, useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import { Redo, RoundButton, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import { ICONS } from "../Icons";
import { fieldType, schemaConfig } from "../state";
import { current } from "./state";

const Row = styled.div`
  align-items: center;
  color: ${({ theme }) => theme.text.secondary};
  display: flex;
  justify-content: space-between;
  width: 100%;
`;

const ContentContainer = styled.div`
  margin: 0.25rem 1rem;
  height: 100%;
`;

const Content = styled.div`
  background: ${({ theme }) => theme.neutral.softBg};
  border-radius: 3px;
  width: 100%;
  flex: 1;
  padding: 1rem;
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
  return (
    <Row>
      <ItemLeft>
        <RoundButton>
          <DeleteOutline /> Delete
        </RoundButton>
      </ItemLeft>
      <ItemRight>
        <Button>Done</Button>
      </ItemRight>
    </Row>
  );
};

export default function Edit() {
  const [label, setLabel] = useAtom(current);
  const config = useAtomValue(schemaConfig("predictions"));

  console.log(config);
  console.log(label);

  return (
    <>
      <ContentContainer>
        <Header />
        <Content>{JSON.stringify(label, null, 2)}</Content>
        <Footer />
      </ContentContainer>
    </>
  );
}
