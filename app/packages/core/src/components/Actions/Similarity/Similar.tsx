import { PopoutSectionTitle } from "@fiftyone/components";
import React, { type MutableRefObject } from "react";
import Input from "../../Common/Input";
import { Button } from "../../utils";
import Popout from "../Popout";
import GroupButton, { type ButtonDetail } from "./GroupButton";
import Helper from "./Helper";
import useSimilarityPopover from "./useSimilarityPopover";

const LONG_BUTTON_STYLE: React.CSSProperties = {
  margin: "0.5rem 0",
  height: "2rem",
  flex: 1,
  textAlign: "center",
};

interface SimilarityPopoverProps {
  modal: boolean;
  isImageSearch: boolean;
  close: () => void;
  anchorRef?: MutableRefObject<HTMLElement>;
  onSearchStart?: () => void;
  onSearchEnd?: () => void;
}

const SimilarityPopover = ({
  modal,
  isImageSearch,
  close,
  anchorRef,
  onSearchStart,
  onSearchEnd,
}: SimilarityPopoverProps) => {
  const {
    textQuery,
    setTextQuery,
    type,
    hasSimilarityKeys,
    showMixedFieldWarning,
    showNoIndexWarning,
    noIndexWarningText,
    searchButtonText,
    handleSearch,
    handleOpenPanel,
  } = useSimilarityPopover({
    modal,
    isImageSearch,
    close,
    onSearchStart,
    onSearchEnd,
  });

  const groupButtons: ButtonDetail[] = [
    {
      icon: "SettingsIcon",
      ariaLabel: "Open similarity panel",
      tooltipText: "Open similarity panel",
      onClick: handleOpenPanel,
    },
  ];

  if (!isImageSearch) {
    groupButtons.unshift({
      icon: "SearchIcon",
      ariaLabel: "Search",
      tooltipText: "Search by text similarity",
      onClick: handleSearch,
    });
  }

  return (
    <Popout modal={modal} style={{ minWidth: 280 }} fixed anchorRef={anchorRef}>
      {showMixedFieldWarning && (
        <PopoutSectionTitle style={{ fontSize: 12 }}>
          Selected labels must be from the same field to search by similarity
        </PopoutSectionTitle>
      )}
      {showNoIndexWarning && (
        <PopoutSectionTitle style={{ fontSize: 12 }}>
          {noIndexWarningText}
        </PopoutSectionTitle>
      )}
      {!showMixedFieldWarning && !showNoIndexWarning && hasSimilarityKeys && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexDirection: "row",
          }}
        >
          {!isImageSearch && (
            <Input
              placeholder={"Type anything!"}
              value={textQuery}
              setter={setTextQuery}
              onEnter={handleSearch}
            />
          )}
          {isImageSearch && (
            <Button
              text={searchButtonText}
              title={`Search by similarity to the selected ${type}`}
              onClick={handleSearch}
              style={LONG_BUTTON_STYLE}
            />
          )}
          <GroupButton buttons={groupButtons} />
        </div>
      )}
      {!showMixedFieldWarning && !showNoIndexWarning && !hasSimilarityKeys && (
        <Helper hasSimilarityKeys={false} isImageSearch={isImageSearch} />
      )}
    </Popout>
  );
};

export default SimilarityPopover;
