import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { SET_EGO_VIEW_EVENT, SET_TOP_VIEW_EVENT } from "../constants";
import { ActionBarContainer, ActionsBar } from "../containers";
import { useHotkey } from "../hooks";
import { fo3dContainsBackground as fo3dContainsBackgroundAtom } from "../state";
import { ChooseColorSpace } from "./ColorSpace";
import { FullScreenToggler } from "./FullScreenToggler";
import { SetPointSizeButton } from "./PointSize";
import { SetViewButton } from "./SetViewButton";
import { SliceSelector } from "./SliceSelector";
import { ToggleFo3dBackground } from "./ToggleBackground";
import { ToggleGridHelper } from "./ToggleGridHelper";
import { ViewFo3d } from "./ViewFo3d";
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
  const hasMultiplePcdSlices = useRecoilValue(fos.hasMultiplePcdSlices);

  const sampleMap = useRecoilValue(fos.activePcdSlicesToSampleMap);
  const sample = useRecoilValue(fos.fo3dSample);

  const sampleForJsonView = useMemo(() => {
    if (isFo3d) {
      return sample;
    }

    return sampleMap;
  }, [sampleMap, sample, isFo3d]);

  const fo3dContainsBackground = useRecoilValue(fo3dContainsBackgroundAtom);

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  useHotkey(
    "KeyJ",
    () => {
      jsonPanel.toggle(sampleForJsonView);
    },
    [sampleForJsonView],
    false
  );

  const componentsToRender = useMemo(() => {
    const components = [];

    if (isFo3d) {
      components.push(<ViewFo3d jsonPanel={jsonPanel} key="inspect-fo3d" />);
    }

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
        onChangeView={() => {
          window.dispatchEvent(new CustomEvent(SET_TOP_VIEW_EVENT));
        }}
        view={"top"}
        label={"T"}
        hint="Top View (T)"
      />
    );

    components.push(
      <SetViewButton
        key="set-ego-view"
        onChangeView={() => {
          window.dispatchEvent(new CustomEvent(SET_EGO_VIEW_EVENT));
        }}
        view={"pov"}
        label={"E"}
        hint="Ego View (E)"
      />
    );

    components.push(
      <ViewJSON
        key="view-json"
        jsonPanel={jsonPanel}
        sample={sampleForJsonView}
      />
    );

    components.push(<ViewHelp key="view-help" helpPanel={helpPanel} />);

    return components;
  }, [fo3dContainsBackground, isFo3d, jsonPanel, helpPanel, sampleForJsonView]);

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
