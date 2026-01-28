import { DetectionLabel } from "@fiftyone/looker";
import { useClearModal } from "@fiftyone/state";
import { DETECTION, POLYLINE } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import styled from "styled-components";
import { isDetection3d } from "../../../../../utils/labels";
import AnnotationSchema from "./AnnotationSchema";
import Field from "./Field";
import Header from "./Header";
import Id from "./Id";
import { PolylineDetails } from "./PolylineDetails";
import Position from "./Position";
import Position3d from "./Position3d";
import PrimitiveWrapper from "./PrimitiveWrapper";
import { currentField, currentOverlay, currentType } from "./state";
import useActivePrimitive from "./useActivePrimitive";
import useExit from "./useExit";
import {
  KnownCommands,
  KnownContexts,
  useKeyBindings,
} from "@fiftyone/commands";
import useDelete from "./useDelete";
import { current } from "../Edit/state";

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
  const [activePrimitivePath] = useActivePrimitive();

  const clear = useClearModal();
  const exit = useExit();

  const onDelete = useDelete();
  const label = useAtomValue(current);

  useKeyBindings(
    KnownContexts.ModalAnnotate,
    [
      {
        commandId: KnownCommands.ModalDeleteAnnotation,
        handler: () => {
          console.log("Delete");
          onDelete();
        },
        enablement: () => {
          return !!label;
        },
        sequence: "Delete",
        label: "Delete",
        description: "Delete label",
      },
    ],
    [onDelete]
  );

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
  const primitiveEditingActive = activePrimitivePath !== null;

  return (
    <ContentContainer>
      <Header />
      <Content>
        <Id />
        {!primitiveEditingActive && <Field />}
        {primitiveEditingActive && <PrimitiveWrapper />}
        {type === DETECTION && overlay && !is3dDetection && <Position />}
        {type === DETECTION && overlay && is3dDetection && <Position3d />}
        {type === POLYLINE && <PolylineDetails />}
        {field && <AnnotationSchema />}
      </Content>
    </ContentContainer>
  );
}
