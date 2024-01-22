import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { MediaTypeFo3dComponent } from "./MediaTypeFo3d";
import { MediaTypePcdComponent } from "./MediaTypePcd";

/**
 * This component is responsible for rendering both "3d" as well as "point_cloud" media types.
 *
 * While "point_cloud" media type is subsumed by "3d" media type, we still need to support it for backwards compatibility.
 */
export const Looker3d = () => {
  const mediaType = useRecoilValue(fos.mediaType);
  const hasFo3dSlice = useRecoilValue(fos.hasFo3dSlice);
  const hasPcdSlices = useRecoilValue(fos.allPcdSlices).length > 0;

  if (mediaType === "group" && hasFo3dSlice && hasPcdSlices) {
    return (
      <div>
        Only allowed to have either one fo3d slice or one or more pcd slices in
        a group.
      </div>
    );
  }

  if (mediaType === "point_cloud" || (mediaType === "group" && hasPcdSlices)) {
    return <MediaTypePcdComponent />;
  } else if (
    mediaType === "three_d" ||
    (mediaType === "group" && hasFo3dSlice)
  ) {
    return <MediaTypeFo3dComponent />;
  }

  return <div>Unsupported media type: {mediaType}</div>;
};
