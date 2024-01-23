import * as fos from "@fiftyone/state";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { SpinningCube } from "../SpinningCube";
import {
  ACTION_GRID,
  ACTION_SET_TOP_VIEW,
  ACTION_VIEW_HELP,
  ACTION_VIEW_JSON,
} from "../constants";
import { useFo3d } from "../hooks";
import { actionRenderListAtomFamily } from "../state";
import { useControls } from "leva";

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

  const mediaUrl = useMemo(() => {
    let mediaUrlUnresolved: string;

    if (Array.isArray(sample.urls)) {
      const mediaFieldObj = sample.urls.find((url) => url.field === mediaField);
      mediaUrlUnresolved = mediaFieldObj?.url ?? sample.urls[0].url;
    } else {
      mediaUrlUnresolved = sample.urls[mediaField];
    }

    return fos.getSampleSrc(mediaUrlUnresolved);
  }, [mediaField, sample]);

  const { data, isLoading, error } = useFo3d(mediaUrl);

  // const { name, aNumber } = useControls("Visibility", {
  //   ...obj
  // });

  if (isLoading) {
    return (
      <Canvas>
        <SpinningCube />
      </Canvas>
    );
  }

  if (error) {
    return <div>error: {error}</div>;
  }

  return (
    <>
      <Canvas>
        <OrbitControls />
        <ambientLight />
        <spotLight position={[10, 10, 10]} />
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="hotpink" />
        </mesh>
      </Canvas>
    </>
  );
};
