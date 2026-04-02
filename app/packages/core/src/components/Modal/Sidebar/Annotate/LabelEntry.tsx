import { useAnnotationEventBus } from "@fiftyone/annotation";
import { useLighter, useOverlayById } from "@fiftyone/lighter";
import { isDetection3dOverlay, isPolyline3dOverlay } from "@fiftyone/looker-3d";
import type { AnnotationLabel } from "@fiftyone/state";
import { animated } from "@react-spring/web";
import type { PrimitiveAtom } from "jotai";
import { getDefaultStore, useAtomValue } from "jotai";
import { useMemo } from "react";
import styled from "styled-components";
import { Column } from "./Components";
import { savedLabel } from "./Edit/state";
import { useFieldType, useStartEditingLabel } from "./redux/hooks";
import { ICONS } from "./Icons";
import useColor from "./useColor";
import { hoveringLabelIds } from "./useHover";

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
  const type = useFieldType(label.path ?? "");
  const startEditingLabel = useStartEditingLabel();
  const Icon = ICONS[type] ?? (() => null);
  const hoveringLabelIdsList = useAtomValue(hoveringLabelIds);
  const { scene } = useLighter();

  const isHovering = hoveringLabelIdsList.includes(label.overlayId);
  const overlay = useOverlayById(label.overlayId);

  const color = useColor(overlay ?? undefined);

  const annotationEventBus = useAnnotationEventBus();

  const handleMouseEnter = useMemo(() => {
    return () => {
      annotationEventBus.dispatch("annotation:sidebarLabelHover", {
        id: label.overlayId,
        tooltip: false,
      });
    };
  }, [annotationEventBus, label.overlayId]);

  const handleMouseLeave = useMemo(() => {
    return () => {
      annotationEventBus.dispatch("annotation:sidebarLabelUnhover", {
        id: label.overlayId,
      });
    };
  }, [annotationEventBus, label.overlayId]);

  const is3DLabel =
    isDetection3dOverlay(label.data) || isPolyline3dOverlay(label.data);

  return (
    <Container
      onClick={() => {
        scene?.selectOverlay(label.overlayId);

        annotationEventBus.dispatch("annotation:sidebarLabelSelected", {
          id: label.overlayId,
          type: label.type,
          data: {
            ...label.data,
            path: label.path,
            id: label.overlayId,
          },
        });

        // For 3D labels, select3DLabelForAnnotation handles setting the editing atom
        // to the correct 3D-specific atom.
        // We should not overwrite it here
        if (!is3DLabel) {
          startEditingLabel(atom);
        }

        store.set(savedLabel, store.get(atom).data);
      }}
      className={isHovering ? "hovering" : ""}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Line fill={color} />
      <Header>
        <Column>
          <Icon fill={color} />
          <div style={!label.data.label ? { color } : { paddingLeft: "8px" }}>
            {label.data.label ?? "None"}
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
