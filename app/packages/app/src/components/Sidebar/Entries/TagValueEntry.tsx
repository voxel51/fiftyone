import { LocalOffer } from "@material-ui/icons";
import { useSpring } from "@react-spring/core";
import React from "react";
import { useRecoilValue } from "recoil";

import * as colorAtoms from "../../../recoil/color";
import { useTheme } from "../../../utils/hooks";
import { NameAndCountContainer } from "../../utils";

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
      color={color}
      heading={
        <>
          <LocalOffer style={{ margin: 2, height: 21, width: 21, color }} />
          <NameAndCountContainer>
            <span>{tag}</span>
          </NameAndCountContainer>
        </>
      }
      backgroundColor={backgroundColor}
      left={true}
    />
  );
};

export default React.memo(TagValueEntry);
