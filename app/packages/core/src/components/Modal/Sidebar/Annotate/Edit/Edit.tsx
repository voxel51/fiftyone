import { useAtom, useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import AnnotationSchema from "./AnnotationSchema";
import Field from "./Field";
import Footer from "./Footer";
import Header from "./Header";
import { current, currentField } from "./state";

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
  display: flex;
  flex-direction: column;
  row-gap: 0.5rem;
`;

export default function Edit() {
  const [label] = useAtom(current);
  const field = useAtomValue(currentField);

  if (!label) {
    return null;
  }

  return (
    <ContentContainer>
      <Header label={label} />
      <Content>
        <Field />
        {field && <AnnotationSchema />}
      </Content>
      <Footer />
    </ContentContainer>
  );
}
