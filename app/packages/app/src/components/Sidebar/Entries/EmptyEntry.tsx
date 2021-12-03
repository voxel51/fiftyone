import React from "react";

import { useTheme } from "../../../utils/hooks";
import { RegularEntry } from "./RegularEntry";

const EmptyEntry = ({ text }: { text: string }) => {
  const theme = useTheme();

  return (
    <RegularEntry
      heading={<span>{text}</span>}
      title={text}
      style={{ color: theme.fontDarkest, background: theme.backgroundLight }}
    />
  );
};

export default React.memo(EmptyEntry);
