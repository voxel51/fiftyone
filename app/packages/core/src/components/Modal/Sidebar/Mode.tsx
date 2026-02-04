import { useAnnotationController } from "@fiftyone/annotation";
import { ModalMode, useModalMode } from "@fiftyone/state";
import {
  Descriptor,
  Size,
  ToggleSwitch,
  ToggleSwitchTab,
} from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import styled from "styled-components";
import { isEditing } from "./Annotate/Edit";

const Container = styled.div`
  padding: 0.5rem 1rem;
  width: 100%;
  margin-top: 12px;
`;

const MODE_TABS: Descriptor<ToggleSwitchTab>[] = [
  { id: ModalMode.EXPLORE, data: { label: "Explore", content: null } },
  { id: ModalMode.ANNOTATE, data: { label: "Annotate", content: null } },
];

const Mode = () => {
  const mode = useModalMode();
  const { enterAnnotationMode, exitAnnotationMode } = useAnnotationController();
  const editing = useAtomValue(isEditing);

  const defaultIndex = mode === ModalMode.ANNOTATE ? 1 : 0;

  const handleChange = useCallback(
    (index: number) => {
      if (index === 1) {
        enterAnnotationMode();
      } else {
        exitAnnotationMode();
      }
    },
    [enterAnnotationMode, exitAnnotationMode]
  );

  if (editing) {
    return null;
  }

  return (
    <Container>
      <ToggleSwitch
        key={mode}
        tabs={MODE_TABS}
        defaultIndex={defaultIndex}
        onChange={handleChange}
        size={Size.Sm}
        fullWidth
        tabPanelClassName="hidden"
      />
    </Container>
  );
};

export default Mode;
