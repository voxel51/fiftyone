import ActionButton from "../ActionButton";
import { executeOperator } from "@fiftyone/operators";
import { useOutsideClick, useSimilarityType } from "@fiftyone/state";
import { SearchIcon, WallpaperIcon } from "@voxel51/voodo";
import { useCallback, useRef, useState } from "react";
import Loading from "../Loading";
import type { ActionProps } from "../types";
import { useActionIconSize } from "../iconSize";
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
  const iconSize = useActionIconSize(24);

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

  const icon = searching ? (
    <Loading />
  ) : showImageSimilarityIcon ? (
    <WallpaperIcon size={iconSize} />
  ) : (
    <SearchIcon size={iconSize} />
  );

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <ActionButton
        key={"button"}
        icon={icon}
        open={open}
        tooltipPlacement={modal ? "bottom" : "top"}
        onClick={togglePopover}
        highlight={open}
        title={`Sort by ${
          showImageSimilarityIcon ? "image" : "text"
        } similarity`}
        style={{ cursor: searching ? "default" : "pointer" }}
        data-cy="action-sort-by-similarity"
      />
      {open && (
        <SimilarityPopover
          key={`similarity-${isImageSearch ? "image" : "text"}`}
          modal={modal}
          isImageSearch={isImageSearch}
          close={() => setOpen(false)}
          anchorRef={ref}
          onSearchStart={() => setSearching(true)}
          onSearchEnd={() => setSearching(false)}
        />
      )}
    </ActionDiv>
  );
};

export default Similarity;
