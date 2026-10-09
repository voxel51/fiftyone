import { useAnnotationController } from "@fiftyone/annotation";
import { useTheme } from "@fiftyone/components";
import { ModalMode, useIsGroupDataset, useModalMode } from "@fiftyone/state";
import { useModalContext } from "../hooks";
import styled from "styled-components";
import useCanAnnotate from "./Annotate/useCanAnnotate";
import { useGroupAnnotationModeController } from "./Annotate/useGroupAnnotationModeController";

const Container = styled.div`
  padding: 0.5rem 1rem;
  width: 100%;
  margin-top: 12px;
`;

const Items = styled.div`
  display: flex;
  position: relative;
  border: 1px solid ${({ theme }) => theme.background.level1};
  border-radius: 3px;
  width: 100%;
  height: 30px;
`;

const Item = styled.div`
  cursor: pointer;
  width: 50%;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

/** Keeps group annotation's mode in step while a mode switch is shown. */
export const GroupsController = (): null => {
  useGroupAnnotationModeController();
  return null;
};

/** Switches the modal between exploring and annotating. */
export const useModeSwitch = () => {
  const mode = useModalMode();
  const { enterAnnotationMode, exitAnnotationMode } = useAnnotationController();
  const isGroupDataset = useIsGroupDataset();
  const { disabledReason, showAnnotationTab } = useCanAnnotate();

  return {
    annotating: mode === ModalMode.ANNOTATE,
    explore: () => mode === ModalMode.ANNOTATE && exitAnnotationMode(),
    annotate: () => mode !== ModalMode.ANNOTATE && enterAnnotationMode(),
    // group annotation keeps its own mode in step while the switch is shown
    groups: showAnnotationTab && isGroupDataset && !disabledReason,
    shown: showAnnotationTab,
  };
};

const Mode = () => {
  const mode = useModalMode();
  const { annotate, explore, groups } = useModeSwitch();
  const theme = useTheme();
  const background = { background: theme.background.level1 };
  const text = { color: theme.text.secondary };
  const { page } = useModalContext();

  // the sample page's header has the switch
  if (page) return null;

  return (
    <>
      {groups && <GroupsController />}
      <Container>
        <Items>
          <Item
            data-cy={ModalMode.EXPLORE}
            style={mode === ModalMode.EXPLORE ? background : text}
            onClick={explore}
          >
            Explore
          </Item>
          <Item
            data-cy={ModalMode.ANNOTATE}
            style={mode === ModalMode.ANNOTATE ? background : text}
            onClick={annotate}
          >
            Annotate
          </Item>
        </Items>
      </Container>
    </>
  );
};

export default Mode;
