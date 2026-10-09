import { PanelCheckbox, PanelSection, Popout } from "@fiftyone/actions";
import * as fos from "@fiftyone/state";

export const GROUP_VISIBILITY_TITLE = "Toggle renderer configuration";

/** Which of a group's renderers show: 3D, 2D, the carousel. */
const GroupVisibilityPopout = ({ modal }: { modal: boolean }) => {
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

  // Mute the 2D Viewer checkbox when annotate mode controls visibility for a 3D slice
  const isAnnotating3d = isAnnotateMode && isSlotVisible && threeDSliceExists;

  return (
    <Popout modal={modal} testId="group-media-visibility-popout">
      <PanelSection title={GROUP_VISIBILITY_TITLE}>
        {threeDSliceExists && (
          <PanelCheckbox
            name="3D Viewer"
            value={isSlotVisible}
            muted={
              isImavidInNestedGroup || (!isMainVisible && !isCarouselVisible)
            }
            setValue={(value) => actions.setVisible(value)}
          />
        )}
        <PanelCheckbox
          name="2D Viewer"
          value={isMainVisible}
          muted={
            isAnnotating3d ||
            isImavidInNestedGroup ||
            (!isCarouselVisible && !threeDSliceExists) ||
            (!(isSlotVisible && threeDSliceExists) && !isCarouselVisible)
          }
          setValue={(value) => actions.setMainViewerVisible(value)}
        />
        {isSequentialAccessAllowed && (
          <PanelCheckbox
            name="Carousel"
            value={isCarouselVisible}
            muted={
              isImavidInNestedGroup ||
              (!(isSlotVisible && threeDSliceExists) && !isMainVisible)
            }
            setValue={setIsCarouselVisible}
          />
        )}
      </PanelSection>
    </Popout>
  );
};

export default GroupVisibilityPopout;
