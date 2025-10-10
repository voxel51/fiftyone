import { DETECTION } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import AnnotationSchema from "./AnnotationSchema";
import Field from "./Field";
import Footer from "./Footer";
import Header from "./Header";
import Position from "./Position";
import { currentField, currentOverlay, currentType } from "./state";

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
  const field = useAtomValue(currentField);
  const overlay = useAtomValue(currentOverlay);
  const type = useAtomValue(currentType);

  return (
    <ContentContainer>
      <Header />
      <Content>
        <Field />
        {type === DETECTION && overlay && <Position />}
        {field && <AnnotationSchema />}
      </Content>
      <Footer />
    </ContentContainer>
  );
}
