import { getSampleSrc } from "@fiftyone/state";
import { ImageList, Orientation } from "@voxel51/voodo";
import { THUMB_SIZE, THUMB_GAP, THUMB_SINGLE_ROW_MAX } from "../../constants";
import { thumbnailStyle, ThumbnailPlaceholder } from "../styled";

type SampleThumbnailsProps = {
  ids: string[];
  sampleMedia: Record<string, string>;
};

export default function SampleThumbnails({
  ids,
  sampleMedia,
}: SampleThumbnailsProps) {
  if (!ids.length) return null;

  // Lay out as a horizontally-scrolling grid of THUMB_SIZE cells: a
  // single row when the count fits, otherwise two rows.
  const rows = ids.length <= THUMB_SINGLE_ROW_MAX ? 1 : 2;
  const containerHeight = THUMB_SIZE * rows + THUMB_GAP * (rows - 1);

  const items = ids.map((id) => ({ id, data: sampleMedia[id] }));

  return (
    <ImageList
      orientation={Orientation.Row}
      cols={rows}
      colWidth={THUMB_SIZE}
      gap={THUMB_GAP}
      style={{ height: containerHeight }}
      items={items}
      renderItem={(filepath) =>
        filepath ? (
          <img
            src={getSampleSrc(filepath)}
            alt="selected images"
            style={thumbnailStyle}
          />
        ) : (
          <ThumbnailPlaceholder />
        )
      }
    />
  );
}
