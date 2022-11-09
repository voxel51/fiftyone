import { useTheme } from "@fiftyone/components";
import { useSpring } from "@react-spring/core";
import React from "react";

import { NameAndCountContainer } from "../../utils";
import RegularEntry from "./RegularEntry";

const EmptyEntry = ({ useText }: { useText: () => string }) => {
  const theme = useTheme();
  const text = useText();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.background.level1,
  });

  return (
    <RegularEntry
      heading={
        <NameAndCountContainer>
          <span style={{ color: theme.text.tertiary }}>{text}</span>
        </NameAndCountContainer>
      }
      title={text}
      backgroundColor={backgroundColor}
    />
  );
};

export default React.memo(EmptyEntry);
