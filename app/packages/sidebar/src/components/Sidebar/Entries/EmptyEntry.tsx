import { cssVar, LoadingDots } from "@voxel51/voodo";
import React from "react";
import { NameAndCountContainer } from "../../utils";
import RegularEntry from "./RegularEntry";

const EmptyEntry = ({
  useText,
}: {
  useText: () => { text: string; loading: boolean };
}) => {
  const { text, loading } = useText();

  return (
    <RegularEntry
      heading={
        <NameAndCountContainer>
          <span style={{ color: cssVar.color.text.tertiary }}>
            {loading ? <LoadingDots text={text} /> : text}
          </span>
        </NameAndCountContainer>
      }
      title={text}
      backgroundColor={cssVar.color.bg["card-nested"]}
    />
  );
};

export default React.memo(EmptyEntry);
