import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

type View = "pov" | "top";

const MODAL_TRUE = true;
const DEFAULT_GREEN = "#00ff00";
const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

/**
 * This component is responsible for rendering both "3d" as well as "point_cloud" media types.
 *
 * While "point_cloud" media type is subsumed by "3d" media type, we still need to support it for backwards compatibility.
 */
export const MediaTypeFo3dComponent = () => {
  const sample = useRecoilValue(fos.fo3dSample);

  return <div>{sample.sample.filepath}</div>;
};
