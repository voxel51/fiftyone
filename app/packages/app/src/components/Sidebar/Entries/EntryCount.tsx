import { CircularProgress } from "@material-ui/core";
import React from "react";
import { useRecoilValue } from "recoil";

import * as aggregationAtoms from "../../../recoil/aggregations";
import { useTheme } from "../../../utils/hooks";

const EntryCount = ({
  path,
  modal,
  ftype,
  embeddedDocType,
}: {
  path: string;
  modal: boolean;
  ftype?: string | string[];
  embeddedDocType?: string | string[];
}) => {
  const theme = useTheme();
  const [count, subCount] = [
    useRecoilValue(
      aggregationAtoms.count({
        extended: false,
        path,
        modal,
        ftype,
        embeddedDocType,
      })
    ),
    useRecoilValue(
      aggregationAtoms.count({
        extended: true,
        path,
        modal,
        ftype,
        embeddedDocType,
      })
    ),
  ];

  if (typeof count !== "number" || typeof subCount !== "number") {
    return (
      <CircularProgress
        style={{
          color: theme.font,
          height: 16,
          width: 16,
          minWidth: 16,
        }}
      />
    );
  }

  return <span>{count.toLocaleString()}</span>;
};

export default React.memo(EntryCount);
