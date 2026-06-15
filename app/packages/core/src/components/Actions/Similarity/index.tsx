import { PillButton } from "@fiftyone/components";
import { executeOperator } from "@fiftyone/operators";
import { useOutsideClick, useSimilarityType } from "@fiftyone/state";
import { Search, Wallpaper } from "@mui/icons-material";
import { useCallback, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import Loading from "../Loading";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import { PANEL_NAME } from "./constants";
import SimilarityPopover from "./Similar";
import { availableSimilarityKeys } from "./utils";

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

  const keys = useRecoilValue(
    availableSimilarityKeys({ modal, isImageSearch: showImageSimilarityIcon })
  );

  const togglePopover = useCallback(() => {
    if (searching) return;
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
    <Wallpaper />
  ) : (
    <Search />
  );

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
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
