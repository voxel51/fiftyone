import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import {
  ACTION_GRID,
  ACTION_SET_EGO_VIEW,
  ACTION_SET_PCDS,
  ACTION_SET_POINT_SIZE,
  ACTION_SET_TOP_VIEW,
  ACTION_SHADE_BY,
  ACTION_VIEW_HELP,
  ACTION_VIEW_JSON,
} from "../constants";
import { ActionBarContainer, ActionsBar } from "../containers";
import { actionRenderListAtomFamily } from "../state";
import { ChooseColorSpace } from "./ColorSpace";
import { SetPointSizeButton } from "./PointSize";
import { SetViewButton } from "./SetViewButton";
import { SliceSelector } from "./SliceSelector";
import { ToggleGridHelper } from "./ToggleGridHelper";
import { ViewHelp } from "./ViewHelp";
import { ViewJSON } from "./ViewJson";

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
  const actionBarRenderList = useRecoilValue(
    actionRenderListAtomFamily(isFo3d ? "fo3d" : "pcd")
  );
  const actionNames = useMemo(
    () =>
      actionBarRenderList.map((actionCallbackPair) => actionCallbackPair[0]),
    [actionBarRenderList]
  );
  const isSliceSelectorOn = useMemo(
    () => actionNames.includes(ACTION_SET_PCDS),
    [actionNames]
  );
  const componentsToRender = useMemo(() => {
    if (actionBarRenderList.length === 0) return null;

    const components = [];

    if (actionNames.includes(ACTION_GRID)) {
      components.push(<ToggleGridHelper />);
    }

    if (actionNames.includes(ACTION_SET_POINT_SIZE)) {
      components.push(<SetPointSizeButton />);
    }

    if (actionNames.includes(ACTION_SHADE_BY)) {
      components.push(<ChooseColorSpace />);
    }

    if (actionNames.includes(ACTION_SET_TOP_VIEW)) {
      components.push(
        <SetViewButton
          onChangeView={
            actionBarRenderList.find(
              (actionCallbackPair) =>
                actionCallbackPair[0] === ACTION_SET_TOP_VIEW
            )[1][0]
          }
          view={"top"}
          label={"T"}
          hint="Top View"
        />
      );
    }

    if (actionNames.includes(ACTION_SET_EGO_VIEW)) {
      components.push(
        <SetViewButton
          onChangeView={
            actionBarRenderList.find(
              (actionCallbackPair) =>
                actionCallbackPair[0] === ACTION_SET_EGO_VIEW
            )[1][0]
          }
          view={"pov"}
          label={"E"}
          hint="Ego View"
        />
      );
    }

    if (actionNames.includes(ACTION_VIEW_JSON)) {
      const args = actionBarRenderList.find(
        (actionCallbackPair) => actionCallbackPair[0] === ACTION_VIEW_JSON
      )[1];
      const jsonPanel = args[0];
      const sample = args[1];

      components.push(<ViewJSON jsonPanel={jsonPanel} sample={sample} />);
    }

    if (actionNames.includes(ACTION_VIEW_HELP)) {
      const args = actionBarRenderList.find(
        (actionCallbackPair) => actionCallbackPair[0] === ACTION_VIEW_HELP
      )[1];
      const helpPanel = args[0];

      components.push(<ViewHelp helpPanel={helpPanel} />);
    }
    return components;
  }, [actionBarRenderList, actionNames]);

  return (
    <ActionBarContainer
      data-cy="looker3d-action-bar"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isSliceSelectorOn && <SliceSelector />}
      <ActionsBar>{componentsToRender}</ActionsBar>
    </ActionBarContainer>
  );
};
