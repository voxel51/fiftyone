import { Popout } from "@fiftyone/actions";
import { PopoutSectionTitle } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import type { MutableRefObject, ReactNode } from "react";
import { useMemo } from "react";
import { Checkbox } from "@fiftyone/sidebar";

export const GROUP_VISIBILITY_TITLE = "Toggle renderer configuration";

/** Which of a group's renderers show: 3D, 2D, the carousel. */
const GroupVisibilityPopout = ({
  modal,
  anchorRef,
}: {
  modal: boolean;
  anchorRef: MutableRefObject<HTMLDivElement | null>;
}) => {
  const threeDSliceExists = fos.useHas3dSlice();
  const isSlotVisible = fos.useIs3dVisibleSetting();
  const actions = fos.useRenderConfig3dActions();
  const [isCarouselVisible, setIsCarouselVisible] =
    fos.useGroupCarouselVisibleSetting();
  const isMainVisible = fos.useIsGroupMain2dViewerVisibleSetting();
  const {
    imaVidInNestedGroup: isImavidInNestedGroup,
    sequential: isSequentialAccessAllowed,
  } = fos.useModalGroupRenderers();
  const isAnnotateMode = fos.useModalMode() === fos.ModalMode.ANNOTATE;

  const checkboxes = useMemo(() => {
    const toReturn: ReactNode[] = [];

    if (threeDSliceExists) {
      toReturn.push(
        <Checkbox
          key="checkbox-3d-viewer"
          name={"3D Viewer"}
          value={isSlotVisible}
          muted={
            isImavidInNestedGroup || (!isMainVisible && !isCarouselVisible)
          }
          setValue={(value) => actions.setVisible(value)}
        />,
      );
    }

    // Mute the 2D Viewer checkbox when annotate mode controls visibility for a 3D slice
    const isAnnotating3d = isAnnotateMode && isSlotVisible && threeDSliceExists;

    toReturn.push(
      <Checkbox
        key="checkbox-viewer"
        name={"2D Viewer"}
        value={isMainVisible}
        muted={
          isAnnotating3d ||
          isImavidInNestedGroup ||
          (!isCarouselVisible && toReturn.length === 0) ||
          (!(isSlotVisible && threeDSliceExists) && !isCarouselVisible)
        }
        setValue={(value) => actions.setMainViewerVisible(value)}
      />,
    );

    if (isSequentialAccessAllowed) {
      toReturn.push(
        <Checkbox
          key="checkbox-carousel"
          name={"Carousel"}
          value={isCarouselVisible}
          muted={
            isImavidInNestedGroup ||
            (!(isSlotVisible && threeDSliceExists) && !isMainVisible)
          }
          setValue={(value) => setIsCarouselVisible(value)}
        />,
      );
    }

    return toReturn;
  }, [
    threeDSliceExists,
    isSequentialAccessAllowed,
    isCarouselVisible,
    isMainVisible,
    isSlotVisible,
    isImavidInNestedGroup,
    setIsCarouselVisible,
    isAnnotateMode,
    actions,
  ]);

  return (
    <Popout
      fixed
      anchorRef={anchorRef}
      modal={modal}
      testId="group-media-visibility-popout"
    >
      <PopoutSectionTitle>{GROUP_VISIBILITY_TITLE}</PopoutSectionTitle>
      {checkboxes}
    </Popout>
  );
};

export default GroupVisibilityPopout;
