import { CircularProgress } from "@material-ui/core";
import React, { useCallback } from "react";
import { RecoilValue, selectorFamily, useRecoilValue } from "recoil";

import * as aggregationAtoms from "../../../recoil/aggregations";
import { fieldIsFiltered } from "../../../recoil/filters";
import { useTheme } from "../../../utils/hooks";
import { MATCH_LABEL_TAGS } from "./utils";

const EntryCounts = ({
  getAtom,
  filteredAtom,
}: {
  getAtom: (subcount: boolean) => RecoilValue<number>;
  filteredAtom: RecoilValue<boolean>;
}) => {
  const theme = useTheme();
  const [count, subcount] = [
    useRecoilValue(getAtom(false)),
    useRecoilValue(getAtom(true)),
  ];
  const filtered = useRecoilValue(filteredAtom);

  if (typeof count !== "number" || (typeof subcount !== "number" && filtered)) {
    return (
      <CircularProgress
        style={{
          color: theme.font,
          height: 16,
          width: 16,
          margin: 4,
        }}
      />
    );
  }

  if (!filtered || count === subcount) {
    return <span>{count.toLocaleString()}</span>;
  }

  return (
    <span>
      {subcount.toLocaleString()} of {count.toLocaleString()}
    </span>
  );
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
  const filteredAtom = fieldIsFiltered({ modal, path });

  return <EntryCounts getAtom={getAtom} filteredAtom={filteredAtom} />;
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
  const filteredAtom = m;

  return <EntryCounts getAtom={getAtom} />;
};
