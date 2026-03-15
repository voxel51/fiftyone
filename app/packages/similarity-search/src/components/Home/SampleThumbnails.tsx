import React from "react";
import { ImageList, ImageListItem } from "../../mui";
import { THUMB_SIZE, THUMB_GAP, THUMB_SINGLE_ROW_MAX } from "../../constants";
import { getMediaUrl } from "../../utils";
import * as s from "../styles";

type SampleThumbnailsProps = {
  ids: string[];
  sampleMedia: Record<string, string>;
};

export default function SampleThumbnails({
  ids,
  sampleMedia,
}: SampleThumbnailsProps) {
  if (!ids.length) return null;

  const useOneRow = ids.length <= THUMB_SINGLE_ROW_MAX;
  const cols = useOneRow ? ids.length : Math.ceil(ids.length / 2);
  const rows = useOneRow ? 1 : 2;

  return (
    <ImageList
      cols={cols}
      rowHeight={THUMB_SIZE}
      gap={THUMB_GAP}
      sx={{
        gridTemplateColumns: `repeat(${cols}, ${THUMB_SIZE}px) !important`,
        overflowX: "auto",
        overflowY: "hidden",
        maxHeight: THUMB_SIZE * rows + THUMB_GAP * (rows - 1),
        m: 0,
      }}
    >
      {ids.map((id) => {
        const filepath = sampleMedia[id];
        return (
          <ImageListItem key={id}>
            {filepath ? (
              <img src={getMediaUrl(filepath)} alt="" style={s.thumbnail} />
            ) : (
              <div style={s.thumbnailPlaceholder} />
            )}
          </ImageListItem>
        );
      })}
    </ImageList>
  );
}
