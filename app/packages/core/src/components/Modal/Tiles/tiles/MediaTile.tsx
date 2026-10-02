import { GroupImageVideoSample } from "../../Group/GroupImageVideoSample";
import { GroupSuspense } from "../../Group/GroupSuspense";

/** The active slice's 2D (image/video) sample. */
export const MediaTile = () => (
  <GroupSuspense main2d>
    <GroupImageVideoSample />
  </GroupSuspense>
);
