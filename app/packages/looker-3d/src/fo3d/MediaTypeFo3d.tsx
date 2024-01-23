import * as fos from "@fiftyone/state";
import { OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva, useControls } from "leva";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { SpinningCube } from "../SpinningCube";
import {
  ACTION_GRID,
  ACTION_SET_TOP_VIEW,
  ACTION_VIEW_HELP,
  ACTION_VIEW_JSON,
  VOXEL51_THEME_COLOR,
  VOXEL51_THEME_COLOR_MUTED,
} from "../constants";
import { LevaContainer } from "../containers";
import { useFo3d } from "../hooks";
import { actionRenderListAtomFamily } from "../state";
import { Fo3dEnvironment } from "./Environment";
import {
  getMediaUrlForFo3dSample,
  getVisibilityMapFromFo3dParsed,
} from "./utils";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

export const MediaTypeFo3dComponent = () => {
  const sample = useRecoilValue(fos.fo3dSample);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

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

  const { data: fo3dParsed, isLoading } = useFo3d(mediaUrl);

  // todo: if the object is checked expand its children as well
  const rootVisibilityMap = useMemo(
    () => getVisibilityMapFromFo3dParsed(fo3dParsed),
    [fo3dParsed]
  );

  const values = useControls("Visibility", rootVisibilityMap ?? {}, [
    rootVisibilityMap,
  ]);

  if (isLoading) {
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
            },
          }}
          fill
          hideCopyButton
          flat
        />
      </LevaContainer>

      <Canvas id={CANVAS_WRAPPER_ID}>
        <OrbitControls />
        <Fo3dEnvironment />

        <TransformControls mode="translate">
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="hotpink" />
          </mesh>
        </TransformControls>
      </Canvas>
    </>
  );
};
