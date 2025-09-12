import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { animated } from "@react-spring/web";
import type { PrimitiveAtom } from "jotai";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { Column } from "./Components";
import { editing } from "./Edit";
import { ICONS } from "./Icons";
import { fieldType } from "./state";
import { hoveringLabelIds } from "./useHover";

const Container = animated(styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
  border-radius: 2px;
  background: ${({ theme }) => theme.neutral.softBg};
  padding: 0.5rem;

  &:hover,
  &.hovering {
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

const LabelEntry = ({ atom }: { atom: PrimitiveAtom<AnnotationLabel> }) => {
  const [isHoveringThisRow, setIsHoveringThisRow] = useState(false);
  const label = useAtomValue(atom);
  const type = useAtomValue(fieldType(label.path));
  const setEditing = useSetAtom(editing);
  const Icon = ICONS[type] ?? ICONS;
  const hoveringLabelIdsList = useAtomValue(hoveringLabelIds);
  const { scene } = useLighter();

  const isHovering = hoveringLabelIdsList.includes(label.id);

  useEffect(() => {
    if (!scene) return;

    if (isHoveringThisRow) {
      scene.dispatchSafely({
        type: LIGHTER_EVENTS.DO_OVERLAY_HOVER,
        detail: { id: label.id, tooltip: false },
      });
    } else {
      scene.dispatchSafely({
        type: LIGHTER_EVENTS.DO_OVERLAY_UNHOVER,
        detail: { id: label.id },
      });
    }
  }, [scene, isHoveringThisRow, label.id]);

  return (
    <Container
      onClick={() => {
        setEditing(atom);
      }}
      className={isHovering ? "hovering" : ""}
      onMouseEnter={() => setIsHoveringThisRow(true)}
      onMouseLeave={() => setIsHoveringThisRow(false)}
    >
      <Line fill="white" />
      <Header>
        <Column>
          <Icon fill="white" />
          <div>{label.data.label}</div>
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

export default LabelEntry;
