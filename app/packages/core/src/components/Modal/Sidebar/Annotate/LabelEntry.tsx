import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useEngineSelector,
  useInteraction,
} from "@fiftyone/annotation";
import type { AnnotationLabel } from "@fiftyone/state";
import { animated } from "@react-spring/web";
<<<<<<< HEAD
import { type PrimitiveAtom, getDefaultStore, useAtomValue } from "jotai";
=======
import { useAtomValue } from "jotai";
>>>>>>> main
import { useMemo } from "react";
import styled from "styled-components";
import { Column } from "./Components";
import { ICONS } from "./Icons";
import { fieldType } from "./state";
import useColor from "./useColor";
<<<<<<< HEAD
import { useIsLabelHovering } from "./useHover";
=======
>>>>>>> main

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

const LabelEntry = ({
  id,
  path,
  frame,
}: {
  id: string;
  path: string;
  frame?: number;
}) => {
  const engine = useAnnotationEngine();
  const sample = useActiveAnnotationSampleId();
  const type = useAtomValue(fieldType(path ?? ""));
  const Icon = ICONS[type] ?? (() => null);
<<<<<<< HEAD
  const { scene } = useLighter();

  const isHovering = useIsLabelHovering(label.overlay.id);
=======

  // read the label declaratively by ref — the engine is the source of truth.
  // `frame` is set for video frame labels (the playhead occurrence the row was
  // derived at) and absent for sample-level / image labels.
  const data = useEngineSelector(engine, (e) =>
    sample ? e.getLabel({ sample, path, instanceId: id, frame }) : undefined,
  );
  const labelText = data?.label as string | undefined;
>>>>>>> main

  // the sidebar reflects the selected slice; refs carry its id (from modal
  // state, so it's correct before the engine registers a store and stays
  // correct once a grouped 2D + 3D modal registers more than one)
  const toRef = useMemo(
    () => () => ({
      sample,
      path,
      instanceId: id,
      frame,
    }),
    [sample, id, path, frame],
  );

  // full-identity read (sample included) — a hand-rolled instanceId+path match
  // would cross-light a same-id row from another slice in a grouped modal
  const isHovering = useInteraction(engine, (i) => i.isHovered(toRef()));

  // color reads only `field` + `label` off the overlay (cf. the 3D rows) — a
  // stub over the engine label is enough, no mounted Lighter overlay needed
  const overlay = useMemo(
    () =>
      ({
        id,
        field: path,
        label: data,
      }) as unknown as AnnotationLabel["overlay"],
    [id, path, data],
  );
  const color = useColor(overlay as Parameters<typeof useColor>[0]);

  return (
    <Container
      data-cy={`annotate-label-${id}`}
      data-cy-path={path}
      data-cy-frame={frame ?? ""}
      data-cy-label={labelText ?? ""}
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
              ...(!labelText
                ? { color, fontStyle: "italic", opacity: 0.7 }
                : {}),
              ...{ paddingLeft: "8px" },
            }}
          >
            {labelText || "(no label)"}
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
