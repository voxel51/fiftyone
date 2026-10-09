import ActionButton from "../ActionButton";
import { executeOperator } from "@fiftyone/operators";
import { useOutsideClick, useSimilarityType } from "@fiftyone/state";
import { ScanSearchIcon, SearchStrokeIcon } from "@voxel51/voodo";
import { useCallback, useRef, useState } from "react";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import { PANEL_NAME } from "./constants";
import SimilarityPopover from "./Similar";
import { useAvailableSimilarityKeys } from "./utils";

const Similarity = ({
  modal,
  adaptiveMenuItemProps,
}: ActionProps & {
  modal: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isImageSearch, setIsImageSearch] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  const { showImageSimilarityIcon } = useSimilarityType({
    isImageSearch,
  });

  const keys = useAvailableSimilarityKeys(modal, showImageSimilarityIcon);

  const togglePopover = useCallback(() => {
    if (searching || keys === null) return;
    if (keys.length === 0) {
      // No applicable keys — open panel directly
      executeOperator("open_panel", {
        name: PANEL_NAME,
        isActive: true,
        layout: "horizontal",
        data: { view: { page: "similarity_index" } },
      });
      return;
    }
    setOpen((o) => !o);
    setIsImageSearch(showImageSimilarityIcon);
  }, [showImageSimilarityIcon, searching, keys]);

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <ActionButton
        key={"button"}
        icon={showImageSimilarityIcon ? ScanSearchIcon : SearchStrokeIcon}
        loading={searching}
        tooltipPlacement={modal ? "bottom" : "top"}
        onClick={togglePopover}
        highlight={open}
        title={`Sort by ${
          showImageSimilarityIcon ? "image" : "text"
        } similarity`}
        data-cy="action-sort-by-similarity"
      />
      {open && (
        <SimilarityPopover
          key={`similarity-${isImageSearch ? "image" : "text"}`}
          modal={modal}
          isImageSearch={isImageSearch}
          close={() => setOpen(false)}
          onSearchStart={() => setSearching(true)}
          onSearchEnd={() => setSearching(false)}
        />
      )}
    </ActionDiv>
  );
};

export default Similarity;
