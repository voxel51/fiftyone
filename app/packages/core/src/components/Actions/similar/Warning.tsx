import React from "react";
import { PopoutSectionTitle, useTheme } from "@fiftyone/components";
import { SORT_BY_SIMILARITY } from "../../../utils/links";
import { ActionOption } from "../Common";

interface Props {
  hasSimilarityKeys: boolean;
  isImageSearch: boolean;
}

const Warning: React.FunctionComponent<Props> = (props) => {
  const theme = useTheme();

  return (
    <>
      {!props.hasSimilarityKeys && (
        <PopoutSectionTitle style={{ fontSize: 12 }}>
          {props.isImageSearch
            ? "No available brain keys"
            : "No brain keys support text prompts"}
        </PopoutSectionTitle>
      )}
      <PopoutSectionTitle>
        <ActionOption
          href={SORT_BY_SIMILARITY}
          text={"Search by text similarity"}
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
