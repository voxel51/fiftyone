import * as fos from "@fiftyone/state";
import { GroupCarouselStrip } from "../../Group/GroupCarousel";
import { GroupSuspense } from "../../Group/GroupSuspense";
import { fill } from "../GroupTilingHost.module.css";

/** Filmstrip of the current group's slices, filling its tile. */
export const CarouselTile = () => {
  const key = fos.useGroupId();
  const mediaField = fos.useSelectedMediaFieldModal();

  return (
    <GroupSuspense>
      <div className={fill} data-cy="group-carousel">
        <GroupCarouselStrip key={`${key}-${mediaField}`} />
      </div>
    </GroupSuspense>
  );
};
