import { PopoutSectionTitle, useTheme } from "@fiftyone/components";
import React from "react";

import { SORT_BY_SIMILARITY } from "../../../utils/links";
import { ActionOption } from "../Common";
import useSimilarityType from "@fiftyone/state/src/hooks/similaritySearch/useSimilarityType";

interface Props {
  hasSimilarityKeys: boolean;
  isImageSearch: boolean;
}

const Helper: React.FunctionComponent<Props> = (props) => {
  const theme = useTheme();
  const { isImageSearch } = props;
  const { text } = useSimilarityType({ isImageSearch });

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
          text={text}
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

export default Helper;
