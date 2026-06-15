import {
  useActiveSampleId,
  useAnnotationEngine,
  useInteraction,
} from "@fiftyone/annotation";
import type { AnnotationLabel } from "@fiftyone/state";
import { animated } from "@react-spring/web";
import type { PrimitiveAtom } from "jotai";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import styled from "styled-components";
import { Column } from "./Components";
import { ICONS } from "./Icons";
import { fieldType } from "./state";
import useColor from "./useColor";

const Container = animated(styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
  border-radius: var(--radius-xs);
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
  border-radius: var(--radius-xs);
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
  const label = useAtomValue(atom);
  const type = useAtomValue(fieldType(label.path ?? ""));
  const engine = useAnnotationEngine();
  const Icon = ICONS[type] ?? (() => null);

  const id = label.overlay.id;
  const path = label.path;
  const sample = useActiveSampleId();

  // the sidebar reflects the selected slice; refs carry its id (from modal
  // state, so it's correct before the engine registers a store and stays
  // correct once a grouped 2D + 3D modal registers more than one)
  const toRef = useMemo(
    () => () => ({
      sample,
      path,
      instanceId: id,
    }),
    [sample, id, path]
  );

  const isHovering = useInteraction(engine, (i) =>
    i.getHovered().some((ref) => ref.instanceId === id && ref.path === path)
  );

  const color = useColor(label.overlay);

  return (
    <Container
      onClick={() => {
        // the form follows the anchor; each surface (2D scene, 3D scene)
        // projects the selection through its own engine adapter
        engine.interaction.setActive([toRef()]);
      }}
      className={isHovering ? "hovering" : ""}
      onMouseEnter={() => engine.interaction.setHovered(toRef(), true)}
      onMouseLeave={() => engine.interaction.setHovered(toRef(), false)}
    >
      <Line fill={color} />
      <Header>
        <Column>
          <Icon fill={color} />
          <div
            style={{
              ...(!label.data.label
                ? { color, fontStyle: "italic", opacity: 0.7 }
                : {}),
              ...{ paddingLeft: "8px" },
            }}
          >
            {label.data.label || "(no label)"}
          </div>
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
