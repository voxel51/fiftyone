import { useTheme } from "@fiftyone/components";
import { LocalOffer } from "@material-ui/icons";
import { useSpring } from "@react-spring/core";
import React from "react";
import { useRecoilValue } from "recoil";

import { NameAndCountContainer } from "../../utils";
import * as fos from "@fiftyone/state";

import RegularEntry from "./RegularEntry";
import { PathEntryCounts } from "./EntryCounts";
import { groupStatistics } from "@fiftyone/state";

const TagValueEntry = ({ path, tag }: { path: string; tag: string }) => {
  const theme = useTheme();
  const { backgroundColor } = useSpring({
    backgroundColor: theme.backgroundLight,
  });
  const color = useRecoilValue(fos.pathColor({ path, modal: true }));
  const group = useRecoilValue(groupStatistics(true)) === "group";

  return (
    <RegularEntry
      backgroundColor={backgroundColor}
      color={color}
      heading={
        <>
          <LocalOffer style={{ margin: 2, height: 21, width: 21, color }} />
          <NameAndCountContainer>
            <span>{tag}</span>
            {group && <PathEntryCounts path={path} modal={true} />}
          </NameAndCountContainer>
        </>
      }
      left={true}
      title={tag}
    />
  );
};

export default React.memo(TagValueEntry);
