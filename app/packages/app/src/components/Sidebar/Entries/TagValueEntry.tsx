import { useTheme } from "@fiftyone/components";
import { LocalOffer } from "@material-ui/icons";
import { useSpring } from "@react-spring/core";
import React from "react";
import { useRecoilValue } from "recoil";

import * as colorAtoms from "../../../recoil/color";
import { NameAndCountContainer } from "../../utils";

import RegularEntry from "./RegularEntry";

const TagValueEntry = ({ path, tag }: { path: string; tag: string }) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });
  const color = useRecoilValue(colorAtoms.pathColor({ path, modal: true }));

  return (
    <RegularEntry
      backgroundColor={backgroundColor}
      color={color}
      heading={
        <>
          <LocalOffer style={{ margin: 2, height: 21, width: 21, color }} />
          <NameAndCountContainer>
            <span>{tag}</span>
          </NameAndCountContainer>
        </>
      }
      left={true}
      title={tag}
    />
  );
};

export default React.memo(TagValueEntry);
