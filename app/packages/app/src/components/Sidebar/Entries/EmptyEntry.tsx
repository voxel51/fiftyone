import { useSpring } from "@react-spring/core";
import React from "react";

import { useTheme } from "../../../utils/hooks";
import { NameAndCountContainer } from "../../utils";
import RegularEntry from "./RegularEntry";

const EmptyEntry = ({ text }: { text: string }) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });

  return (
    <RegularEntry
      heading={
        <NameAndCountContainer>
          <span style={{ color: theme.fontDarkest }}>{text}</span>
        </NameAndCountContainer>
      }
      title={text}
      backgroundColor={backgroundColor}
    />
  );
};

export default React.memo(EmptyEntry);
