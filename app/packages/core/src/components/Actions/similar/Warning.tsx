import { PopoutSectionTitle, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { SORT_BY_SIMILARITY } from "../../../utils/links";
import { ActionOption } from "../Common";

interface Props {
  hasSimilarityKeys: boolean;
  isImageSearch: boolean;
  modal: boolean;
}

const Warning: React.FunctionComponent<Props> = (props) => {
  const theme = useTheme();
  const hasSelectedSamples = useRecoilValue(fos.hasSelectedSamples);
  const hasSelectedLabels = useRecoilValue(fos.hasSelectedLabels);
  const hasSorting = Boolean(useRecoilValue(fos.similarityParameters));

  const isImageSearch =
    hasSelectedSamples ||
    (props.isImageSearch && hasSorting) ||
    (props.modal && hasSelectedLabels);

  const warningText = isImageSearch
    ? "Search by image similarity"
    : "Sort by text similarity";

  return (
    <>
      {!props.hasSimilarityKeys && (
        <PopoutSectionTitle style={{ fontSize: 12 }}>
          {isImageSearch
            ? "No available brain keys"
            : "No brain keys support text prompts"}
        </PopoutSectionTitle>
      )}
      <PopoutSectionTitle>
        <ActionOption
          id="sort-by-similarity"
          href={SORT_BY_SIMILARITY}
          text={warningText}
          title={"About sorting by similarity"}
          style={{
            background: "unset",
            color: theme.text.primary,
            paddingTop: 0,
            paddingBottom: 0,
          }}
          svgStyles={{ height: "1rem", marginTop: 7.5 }}
        />
      </PopoutSectionTitle>
    </>
  );
};

export default Warning;
