import * as fos from "@fiftyone/state";
import { isFo3dSamplePath } from "@fiftyone/utilities";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { Logs } from "../Logs";
import { SET_EGO_VIEW_EVENT, SET_TOP_VIEW_EVENT } from "../constants";
import { ActionBarContainer, ActionsBar } from "../containers";
import { LEVA_CONTAINER_ID } from "../fo3d/Leva";
import { getMediaPathForFo3dSample } from "../fo3d/utils";
import { useHotkey } from "../hooks";
import { fo3dContainsBackground as fo3dContainsBackgroundAtom } from "../state";
import { LevaConfigPanel } from "./LevaConfigPanel";
import { SetViewButton } from "./SetViewButton";
import { SliceSelector } from "./SliceSelector";
import { ToggleFo3dBackground } from "./ToggleBackground";
import { ToggleFrustums } from "./ToggleFrustums";
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
  const activeFo3dSlice = fos.useActiveFo3dSlice();
  const sceneSample = fos.useScene3dSample();
  const interactionSample = fos.useInteraction3dSample();
  const hasMultipleSlices = fos.useHasMultiple3dSlices();
  const fo3dContent = fos.useFo3dContent();
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const isFo3d = useMemo(() => {
    const mediaPath = getMediaPathForFo3dSample(sceneSample, mediaField);

    return (
      Boolean(activeFo3dSlice) ||
      isFo3dSamplePath(mediaPath) ||
      isFo3dSamplePath(sceneSample?.sample?.filepath)
    );
  }, [activeFo3dSlice, mediaField, sceneSample]);
  const isGroup = useRecoilValue(fos.isGroup);

  const fo3dContainsBackground = useRecoilValue(fo3dContainsBackgroundAtom);

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  useHotkey(
    "KeyJ",
    () => {
      jsonPanel.toggle(interactionSample);
    },
    [interactionSample],
    { useTransaction: false }
  );

  const componentsToRender = useMemo(() => {
    const components = [];

    if (hasMultipleSlices) {
      components.push(<SliceSelector key="slice-selector" />);
    }

    components.push(<LevaConfigPanel key="leva-config-panel" />);
    if (isFo3d && fo3dContent) {
      components.push(<ViewFo3d jsonPanel={jsonPanel} key="inspect-fo3d" />);
    }

    components.push(<ToggleGridHelper key="grid-helper" />);

    if (fo3dContainsBackground) {
      components.push(<ToggleFo3dBackground key="toggle-background" />);
    }

    if (isGroup) {
      components.push(<ToggleFrustums key="toggle-frustums" />);
    }

    components.push(
      <SetViewButton
        key="set-top-view"
        dataCy="looker-3d-set-top-view"
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
        dataCy="looker-3d-set-ego-view"
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
        sample={interactionSample}
      />
    );

    components.push(<ViewHelp key="view-help" helpPanel={helpPanel} />);

    return components;
  }, [
    fo3dContainsBackground,
    fo3dContent,
    hasMultipleSlices,
    isFo3d,
    isGroup,
    jsonPanel,
    helpPanel,
    interactionSample,
  ]);

  return (
    <>
      <ActionBarContainer
        data-cy="looker3d-action-bar"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Logs />
        <ActionsBar>{componentsToRender}</ActionsBar>
      </ActionBarContainer>

      {/* will be inserted from portal */}
      <div
        id={LEVA_CONTAINER_ID}
        data-cy="looker3d-leva-container"
        style={{
          position: "absolute",
          minWidth: "300px",
          bottom: "3em",
          right: 0,
          zIndex: 1111,
        }}
      />
    </>
  );
};
