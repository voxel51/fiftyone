import type { AnnotationLabel } from "@fiftyone/state";
import { animated } from "@react-spring/web";
import { useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import { Column } from "./Components";
import { Classification, Detection } from "./Icons";
import { fieldType } from "./state";

const Container = animated(styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
  border-radius: 2px;
  background: ${({ theme }) => theme.neutral.softBg};
  padding: 0.5rem;

  &:hover {
    background: ${({ theme }) => theme.background.level1};
  }
`);

const Header = styled.div`
  vertical-align: middle;
  display: flex;
  font-weight: bold;
  width: 100%;
  flex: 1;
  justify-content: space-between;
`;

const Line = styled.div<{ fill: string }>`
  position: absolute;
  top: 0px;
  z-index: 0;
  border-radius: 2px;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  overflow: hidden;
  width: 5px;
  left: 0px;
  cursor: default;
  background: ${({ fill }) => fill};
`;

const ICONS = {
  Classification: Classification,
  Classifications: Classification,
  Detections: Detection,
  Detection: Detection,
};

const ObjectEntry = ({ data, path }: AnnotationLabel) => {
  const type = useAtomValue(fieldType(path));
  const Icon = ICONS[type] ?? ICONS;

  return (
    <Container>
      <Line fill="white" />
      <Header>
        <Column>
          <Icon fill="white" />
          <div>{data.label}</div>
        </Column>

        {/*
        <Column>
          <Locking on={true} />
          <Shown on={true} />
        </Column>
        */}
      </Header>
    </Container>
  );
};

export default ObjectEntry;
