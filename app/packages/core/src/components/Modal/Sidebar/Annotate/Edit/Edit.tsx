import { DetectionLabel } from "@fiftyone/looker";
import { useClearModal } from "@fiftyone/state";
import { DETECTION, KEYPOINT, POLYLINE } from "@fiftyone/utilities";
import { Heading, HeadingLevel } from "@voxel51/voodo";
import { ReactNode, useEffect } from "react";
import styled from "styled-components";
import { isDetection3d } from "../../../../../utils/labels";
import AnnotationSchema from "./AnnotationSchema";
import Field from "./Field";
import Header from "./Header";
import Id from "./Id";
import MaskPreview from "./MaskPreview";
import { KeypointDetails } from "./KeypointDetails";
import { PolylineDetails } from "./PolylineDetails";
import Position from "./Position";
import Position3d from "./Position3d";
import TemporalDetectionDetails from "./TemporalDetectionDetails";
import { useAnnotationContext } from "./useAnnotationContext";
import PrimitiveWrapper from "./PrimitiveWrapper";
import useActivePrimitive from "./useActivePrimitive";
import useExit from "./useExit";
import { useSegmentationMode } from "./useSegmentationMode";

const ContentContainer = styled.div`
  margin: 0.25rem 1rem;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const Content = styled.div`
  background: ${({ theme }) => theme.neutral.softBg};
  border-radius: var(--radius-xs);
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 1rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  row-gap: 0.5rem;
`;

const Section = styled.section`
  border-top: 1px solid ${({ theme }) => theme.neutral.softBorder};
  margin-top: 0.5rem;
  padding-top: 0.75rem;
`;

const SectionHeading = styled(Heading)`
  margin: 0 0 0.75rem;
`;

/**
 * Headlined attribute-scope group. Keypoints carry attributes at two scopes —
 * the whole label (e.g. `label`) and the individual point (e.g. per-point
 * `confidence`) — and their form fields look alike, so each scope's block
 * sits under its own ruled-off headline.
 */
const ScopeSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <Section>
    <SectionHeading level={HeadingLevel.H4}>{title}</SectionHeading>
    {children}
  </Section>
);

export default function Edit() {
  const { selected } = useAnnotationContext();
  const field = selected?.field ?? null;
  const overlay = selected?.overlay;
  const type = selected?.type ?? null;
  const data = selected?.data;
  const isReadOnly = selected?.isFieldReadOnly ?? false;
  const { isEditingMask } = useSegmentationMode();
  // `mask` and `mask_path` exist only on DetectionLabel; the union narrows
  // them out. Cast at the access site rather than type-guarding the whole
  // expression.
  const maskFields = data as { mask?: unknown; mask_path?: unknown } | null;
  const isMaskDetection = !!(
    maskFields?.mask ||
    maskFields?.mask_path ||
    isEditingMask
  );
  const [activePrimitivePath] = useActivePrimitive();

  const clear = useClearModal();
  const exit = useExit();

  useEffect(() => {
    const pointerDownHandler = (event: Event) => {
      pointerDownTarget = event.target;
    };

    const clickHandler = (event: Event) => {
      if (event.target === el && pointerDownTarget === el) {
        event.stopImmediatePropagation();
        clear();
        exit();
      }

      pointerDownTarget = null;
    };

    const el = document.getElementById("modal")?.children[0];
    let pointerDownTarget: EventTarget | null = null;

    el?.addEventListener("pointerdown", pointerDownHandler, true);
    el?.addEventListener("click", clickHandler, true);

    return () => {
      el?.removeEventListener("pointerdown", pointerDownHandler, true);
      el?.removeEventListener("click", clickHandler, true);
    };
  }, [exit, clear]);

  const is3dDetection =
    overlay && isDetection3d(overlay.label as DetectionLabel);
  const isTemporalDetection =
    (data as { _cls?: string } | null)?._cls === "TemporalDetection";
  const primitiveEditingActive = activePrimitivePath !== null;

  return (
    <ContentContainer>
      <Header />
      <Content>
        <Id />
        {!primitiveEditingActive && <Field />}
        {primitiveEditingActive && <PrimitiveWrapper />}
        {type === DETECTION && overlay && !is3dDetection && (
          <Position readOnly={isReadOnly || isMaskDetection} />
        )}
        {type === DETECTION && overlay && is3dDetection && (
          <Position3d readOnly={isReadOnly} />
        )}
        {type === POLYLINE && <PolylineDetails />}
        {type === KEYPOINT && (
          <ScopeSection title="Points">
            <KeypointDetails />
          </ScopeSection>
        )}
        {isTemporalDetection && (
          <TemporalDetectionDetails readOnly={isReadOnly} />
        )}
        {field &&
          (type === KEYPOINT ? (
            <ScopeSection title="Label attributes">
              <AnnotationSchema readOnly={isReadOnly} />
            </ScopeSection>
          ) : (
            <AnnotationSchema readOnly={isReadOnly} />
          ))}
        {isMaskDetection && <MaskPreview />}
      </Content>
    </ContentContainer>
  );
}
