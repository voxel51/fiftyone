import { useTheme } from "@fiftyone/components";
import { LocalOffer } from "@material-ui/icons";
import { useSpring } from "@react-spring/core";
import React from "react";
import { useRecoilValue } from "recoil";

import { NameAndCountContainer } from "../../utils";
import * as fos from "@fiftyone/state";

import RegularEntry from "./RegularEntry";

const TagValueEntry = ({ path, tag }: { path: string; tag: string }) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });
  const color = useRecoilValue(fos.pathColor({ path, modal: true }));

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
