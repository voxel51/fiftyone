import React from "react";
import { useTheme } from "@fiftyone/components";
import { useSpring } from "@react-spring/core";

import LoadingDots from "../../../../../components/src/components/Loading/LoadingDots";
import { NameAndCountContainer } from "../../utils";
import RegularEntry from "./RegularEntry";

const EmptyEntry = ({
  useText,
}: {
  useText: () => { text: string; loading: boolean };
}) => {
  const theme = useTheme();
  const { text, loading } = useText();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.background.level1,
  });

  return (
    <RegularEntry
      heading={
        <NameAndCountContainer>
          <span style={{ color: theme.text.tertiary }}>
            {loading ? <LoadingDots text={text} /> : text}
          </span>
        </NameAndCountContainer>
      }
      title={text}
      backgroundColor={backgroundColor}
    />
  );
};

export default React.memo(EmptyEntry);
