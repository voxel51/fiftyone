import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { useFo3d } from "./hooks";
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { SpinningCube } from "./SpinningCube";

type View = "pov" | "top";

const MODAL_TRUE = true;
const DEFAULT_GREEN = "#00ff00";
const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

export const MediaTypeFo3dComponent = () => {
  const sample = useRecoilValue(fos.fo3dSample);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

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

  if (isLoading) {
    return (
      <Canvas>
        <SpinningCube />
      </Canvas>
    );
  }

  return <div>{sample.sample.filepath}</div>;
};
