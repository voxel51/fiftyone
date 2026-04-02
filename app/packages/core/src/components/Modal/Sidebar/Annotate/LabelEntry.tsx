import { useAnnotationEventBus } from "@fiftyone/annotation";
import { useLighter, useOverlayById } from "@fiftyone/lighter";
import { isDetection3dOverlay, isPolyline3dOverlay } from "@fiftyone/looker-3d";
import { animated } from "@react-spring/web";
import { useMemo } from "react";
import styled from "styled-components";
import { Column } from "./Components";
import {
  useFieldType,
  useLabelByOverlayId,
  useSetHoveredLabel,
  useStartEditingLabel,
} from "./redux/hooks";
import { ICONS } from "./Icons";
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

const LabelEntry = ({ overlayId }: { overlayId: string }) => {
  const label = useLabelByOverlayId(overlayId);
  const type = useFieldType(label?.path ?? "");
  const startEditingLabel = useStartEditingLabel();
  const Icon = ICONS[type] ?? (() => null);
  const { scene } = useLighter();
  const overlay = useOverlayById(overlayId);
  const color = useColor(overlay ?? undefined);
  const annotationEventBus = useAnnotationEventBus();
  const setHovered = useSetHoveredLabel();

  const handleMouseEnter = useMemo(() => {
    return () => {
      setHovered(overlayId);
      annotationEventBus.dispatch("annotation:sidebarLabelHover", {
        id: overlayId,
        tooltip: false,
      });
    };
  }, [annotationEventBus, overlayId, setHovered]);

  const handleMouseLeave = useMemo(() => {
    return () => {
      setHovered(null);
      annotationEventBus.dispatch("annotation:sidebarLabelUnhover", {
        id: overlayId,
      });
    };
  }, [annotationEventBus, overlayId, setHovered]);

  if (!label) return null;

  const is3DLabel =
    isDetection3dOverlay(label.data) || isPolyline3dOverlay(label.data);

  return (
    <Container
      onClick={() => {
        scene?.selectOverlay(overlayId);

        annotationEventBus.dispatch("annotation:sidebarLabelSelected", {
          id: overlayId,
          type: label.type,
          data: {
            ...label.data,
            path: label.path,
            id: overlayId,
          },
        });

        if (!is3DLabel) {
          startEditingLabel(overlayId);
        }
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Line fill={color} />
      <Header>
        <Column>
          <Icon fill={color} />
          <div
            style={
              !label.label ? { color } : { paddingLeft: "8px" }
            }
          >
            {label.label ?? "None"}
          </div>
        </Column>
      </Header>
    </Container>
  );
};

export default LabelEntry;
