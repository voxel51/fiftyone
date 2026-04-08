import { PillButton } from "@fiftyone/components";
import { useOutsideClick, useSimilarityType } from "@fiftyone/state";
import { Search, Wallpaper } from "@mui/icons-material";
import React, { useCallback, useRef, useState } from "react";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import SimilarityPopover from "./Similar";

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

  const togglePopover = useCallback(() => {
    setOpen((o) => !o);
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
        onClick={togglePopover}
        highlight={open}
        title={`Sort by ${
          showImageSimilarityIcon ? "image" : "text"
        } similarity`}
        style={{ cursor: "pointer" }}
        data-cy="action-sort-by-similarity"
      />
      {open && (
        <SimilarityPopover
          modal={modal}
          isImageSearch={isImageSearch}
          close={() => setOpen(false)}
          anchorRef={ref}
        />
      )}
    </ActionDiv>
  );
};

export default Similarity;
