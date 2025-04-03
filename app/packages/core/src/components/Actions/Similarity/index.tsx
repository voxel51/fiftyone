import { PillButton } from "@fiftyone/components";
import { useOutsideClick, useSimilarityType } from "@fiftyone/state";
import { Search, Wallpaper } from "@mui/icons-material";
import React, { useCallback, useRef, useState } from "react";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import SortBySimilarity from "./Similar";

const Similarity = ({
  modal,
  adaptiveMenuItemProps,
}: ActionProps & {
  modal: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [isImageSearch, setIsImageSearch] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  const { showImageSimilarityIcon } = useSimilarityType({
    isImageSearch,
  });

  const toggleSimilarity = useCallback(() => {
    setOpen((open) => !open);
    setIsImageSearch(showImageSimilarityIcon);
  }, [showImageSimilarityIcon]);

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        key={"button"}
        icon={showImageSimilarityIcon ? <Wallpaper /> : <Search />}
        open={open}
        tooltipPlacement={modal ? "bottom" : "top"}
        onClick={toggleSimilarity}
        highlight={true}
        title={`Sort by ${
          showImageSimilarityIcon ? "image" : "text"
        } similarity`}
        style={{ cursor: "pointer" }}
        data-cy="action-sort-by-similarity"
      />
      {open && (
        <SortBySimilarity
          key={`similary-${showImageSimilarityIcon ? "image" : "text"}`}
          modal={modal}
          close={() => setOpen(false)}
          isImageSearch={isImageSearch}
          anchorRef={ref}
        />
      )}
    </ActionDiv>
  );
};

export default Similarity;
