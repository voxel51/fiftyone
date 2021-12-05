import { CircularProgress } from "@material-ui/core";
import React, { useCallback } from "react";
import { RecoilValue, selectorFamily, useRecoilValue } from "recoil";

import * as aggregationAtoms from "../../../recoil/aggregations";
import { useTheme } from "../../../utils/hooks";
import { MATCH_LABEL_TAGS } from "./utils";

const EntryCounts = ({
  getAtom,
}: {
  getAtom: (subcount: boolean) => RecoilValue<number>;
}) => {
  const theme = useTheme();
  const [count, subcount] = [
    useRecoilValue(getAtom(false)),
    useRecoilValue(getAtom(true)),
  ];

  if (typeof count !== "number" || typeof subcount !== "number") {
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

  if (count === subcount) {
  }

  return <span>{count.toLocaleString()}</span>;
};

export const PathEntryCounts = ({
  modal,
  path,
}: {
  path: string;
  modal: boolean;
}) => {
  const getAtom = useCallback(
    (extended: boolean) =>
      aggregationAtoms.count({
        extended,
        modal,
        path,
      }),
    [modal, path]
  );

  return <EntryCounts getAtom={getAtom} />;
};

const labelTagCount = selectorFamily<
  number,
  { modal: boolean; tag: string; extended: boolean }
>({
  key: `labelTagCount`,
  get: ({ tag, ...rest }) => ({ get }) =>
    get(
      aggregationAtoms.cumulativeCounts({
        path: tag,
        ...MATCH_LABEL_TAGS,
        ...rest,
      })
    )[tag],
});

export const LabelTagCounts = ({
  modal,
  tag,
}: {
  modal: boolean;
  tag: string;
}) => {
  const getAtom = useCallback(
    (extended: boolean) => labelTagCount({ modal, tag, extended }),
    [modal]
  );

  return <EntryCounts getAtom={getAtom} />;
};
