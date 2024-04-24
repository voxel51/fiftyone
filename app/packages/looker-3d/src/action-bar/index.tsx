import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { ActionBarContainer, ActionsBar } from "../containers";
import { fo3dContainsBackground as fo3dContainsBackgroundAtom } from "../state";
import { ChooseColorSpace } from "./ColorSpace";
import { FullScreenToggler } from "./FullScreenToggler";
import { SetPointSizeButton } from "./PointSize";
import { SetViewButton } from "./SetViewButton";
import { SliceSelector } from "./SliceSelector";
import { ToggleFo3dBackground } from "./ToggleBackground";
import { ToggleGridHelper } from "./ToggleGridHelper";

export const ActionBar = ({
  onMouseEnter,
  onMouseLeave,
}: {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) => {
  const isFo3dSlice = useRecoilValue(fos.fo3dSlice);
  const mediaType = useRecoilValue(fos.mediaType);
  const isFo3d = useMemo(
    () => isFo3dSlice || mediaType === "three_d",
    [isFo3dSlice, mediaType]
  );
  const hasMultiplePcdSlices = useRecoilValue(fos.hasMultiplePcdSlices);

  const fo3dContainsBackground = useRecoilValue(fo3dContainsBackgroundAtom);

  const componentsToRender = useMemo(() => {
    const components = [];

    components.push(<ToggleGridHelper key="grid-helper" />);

    if (fo3dContainsBackground) {
      components.push(<ToggleFo3dBackground key="toggle-background" />);
    }

    if (!isFo3d) {
      components.push(<SetPointSizeButton key="set-point-size" />);
      components.push(<ChooseColorSpace key="choose-color-space" />);
    }

    components.push(
      <SetViewButton
        key="set-top-view"
        onChangeView={
          () => {}
          // actionBarRenderList.find(
          //   (actionCallbackPair) =>
          //     actionCallbackPair[0] === ACTION_SET_TOP_VIEW
          // )[1][0]
        }
        view={"top"}
        label={"T"}
        hint="Top View (T)"
      />
    );

    components.push(
      <SetViewButton
        key="set-ego-view"
        onChangeView={
          () => {}
          // actionBarRenderList.find(
          //   (actionCallbackPair) =>
          //     actionCallbackPair[0] === ACTION_SET_EGO_VIEW
          // )[1][0]
        }
        view={"pov"}
        label={"E"}
        hint="Ego View (E)"
      />
    );

    // if (actionNames.includes(ACTION_VIEW_JSON)) {
    //   const args = actionBarRenderList.find(
    //     (actionCallbackPair) => actionCallbackPair[0] === ACTION_VIEW_JSON
    //   )[1];
    //   const jsonPanel = args[0];
    //   const sample = args[1];

    //   components.push(
    //     <ViewJSON key="view-json" jsonPanel={jsonPanel} sample={sample} />
    //   );
    // }

    // if (actionNames.includes(ACTION_VIEW_HELP)) {
    //   const args = actionBarRenderList.find(
    //     (actionCallbackPair) => actionCallbackPair[0] === ACTION_VIEW_HELP
    //   )[1];
    //   const helpPanel = args[0];

    //   components.push(<ViewHelp key="view-help" helpPanel={helpPanel} />);
    // }
    return components;
  }, [fo3dContainsBackground, isFo3d]);

  return (
    <ActionBarContainer
      data-cy="looker3d-action-bar"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {hasMultiplePcdSlices && <SliceSelector />}
      <ActionsBar>
        {componentsToRender}
        <FullScreenToggler />
      </ActionsBar>
    </ActionBarContainer>
  );
};
