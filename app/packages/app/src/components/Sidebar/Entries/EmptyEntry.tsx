import { useSpring } from "@react-spring/core";
import React from "react";

import { useTheme } from "../../../utils/hooks";
import RegularEntry, { HeaderTextContainer } from "./RegularEntry";

const EmptyEntry = ({ text }: { text: string }) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });

  return (
    <RegularEntry
      heading={
        <HeaderTextContainer>
          <span style={{ color: theme.fontDarkest }}>{text}</span>
        </HeaderTextContainer>
      }
      title={text}
      backgroundColor={backgroundColor}
    />
  );
};

export default React.memo(EmptyEntry);
