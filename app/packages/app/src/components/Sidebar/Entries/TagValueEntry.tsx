import { LocalOffer } from "@material-ui/icons";
import { useSpring } from "@react-spring/core";
import React from "react";
import { useRecoilValue } from "recoil";

import * as colorAtoms from "../../../recoil/color";
import { useTheme } from "../../../utils/hooks";

import RegularEntry from "./RegularEntry";

const TagValueEntry = ({ tag, path }: { tag: string; path: string }) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });
  const color = useRecoilValue(colorAtoms.pathColor({ path, modal: true }));

  return (
    <RegularEntry
      title={tag}
      heading={
        <>
          <LocalOffer style={{ marginRight: "0.5rem", color }} />
          <span>{tag}</span>
        </>
      }
      backgroundColor={backgroundColor}
    />
  );
};

export default React.memo(TagValueEntry);
