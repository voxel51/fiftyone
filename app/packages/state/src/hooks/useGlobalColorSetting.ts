import * as fos from "@fiftyone/state";
import { useRecoilState } from "recoil";

const useGlobalColorSetting = () => {
  const [opacity, setOpacity] = useRecoilState(fos.alpha);
  const [colorBy, setColorBy] = useRecoilState(
    fos.appConfigOption({ key: "colorBy", modal: false })
  );
  const [useMulticolorKeypoints, setUseMultiplecolorKeypoints] = useRecoilState(
    fos.appConfigOption({ key: "multicolorKeypoints", modal: false })
  );
  const [showSkeleton, setShowSkeleton] = useRecoilState(
    fos.appConfigOption({ key: "showSkeletons", modal: false })
  );

  const props = {
    opacity,
    colorBy: colorBy as "field" | "value",
    useMulticolorKeypoints: useMulticolorKeypoints as boolean,
    showSkeleton: showSkeleton as boolean,
    setOpacity,
    setColorBy,
    setUseMultiplecolorKeypoints,
    setShowSkeleton,
  };

  return { props };
};

export default useGlobalColorSetting;
