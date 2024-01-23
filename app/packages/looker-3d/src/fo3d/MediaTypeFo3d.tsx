import * as fos from "@fiftyone/state";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva, useControls } from "leva";
import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { Vector3 } from "three";
import { Looker3dPluginSettings } from "../Looker3dPlugin";
import { SpinningCube } from "../SpinningCube";
import {
  ACTION_GRID,
  ACTION_SET_TOP_VIEW,
  ACTION_VIEW_HELP,
  ACTION_VIEW_JSON,
  VOXEL51_COMPLEMENTARY_COLOR,
  VOXEL51_THEME_COLOR,
  VOXEL51_THEME_COLOR_MUTED,
} from "../constants";
import { LevaContainer } from "../containers";
import { useFo3d } from "../hooks";
import { actionRenderListAtomFamily } from "../state";
import { Fo3dEnvironment } from "./Environment";
import { Objs } from "./Objs";
import {
  getMediaUrlForFo3dSample,
  getVisibilityMapFromFo3dParsed,
} from "./utils";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

type MediaTypeFo3dComponentProps = {
  settings: Looker3dPluginSettings;
};

export const MediaTypeFo3dComponent = ({
  settings,
}: MediaTypeFo3dComponentProps) => {
  const sample = useRecoilValue(fos.fo3dSample);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  const defaultCameraPosition = useMemo(() => {
    // todo: sync with local storage
    if (settings.defaultCameraPosition) {
      return new Vector3(
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z
      );
    } else {
      return new Vector3(1, 1, 20);
    }
  }, [settings]);

  const setActionBarItems = useSetRecoilState(
    actionRenderListAtomFamily("fo3d")
  );

  const onChangeView = useCallback((view: string) => {
    // set camera to top position
  }, []);

  useEffect(() => {
    setActionBarItems([
      [ACTION_GRID, []],
      [ACTION_SET_TOP_VIEW, [onChangeView]],
      [ACTION_VIEW_JSON, [jsonPanel, sample]],
      [ACTION_VIEW_HELP, [helpPanel]],
    ]);
  }, [onChangeView, jsonPanel, sample, helpPanel, setActionBarItems]);

  const mediaUrl = useMemo(
    () => getMediaUrlForFo3dSample(sample, mediaField),
    [mediaField, sample]
  );

  const { data: fo3dParsed, isLoading: isParsingFo3d } = useFo3d(mediaUrl);

  // todo: if the object is checked expand its children as well
  const defaultVisibilityMap = useMemo(
    () => getVisibilityMapFromFo3dParsed(fo3dParsed),
    [fo3dParsed]
  );

  const visibilityMap = useControls("Visibility", defaultVisibilityMap ?? {}, [
    defaultVisibilityMap,
  ]);

  if (isParsingFo3d) {
    return (
      <Canvas>
        <SpinningCube />
      </Canvas>
    );
  }

  return (
    <>
      <LevaContainer>
        <Leva
          theme={{
            colors: {
              accent1: VOXEL51_THEME_COLOR_MUTED,
              accent2: VOXEL51_THEME_COLOR,
              accent3: VOXEL51_COMPLEMENTARY_COLOR,
            },
          }}
          fill
          hideCopyButton
          flat
        />
      </LevaContainer>

      <Canvas id={CANVAS_WRAPPER_ID}>
        <Suspense fallback={<SpinningCube />}>
          <PerspectiveCamera makeDefault position={defaultCameraPosition} />
          <OrbitControls />
          <Fo3dEnvironment />

          <Objs objs={fo3dParsed.objs} visibilityMap={visibilityMap} />
        </Suspense>
      </Canvas>
    </>
  );
};
