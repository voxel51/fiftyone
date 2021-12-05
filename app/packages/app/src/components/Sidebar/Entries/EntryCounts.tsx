import { CircularProgress } from "@material-ui/core";
import React, { useCallback } from "react";
import { RecoilValue, useRecoilValue } from "recoil";

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

export const LabelTagCounts = ({ modal }: { modal: boolean }) => {
  const getAtom = useCallback(
    (extended: boolean) =>
      aggregationAtoms.count({
        extended,
        modal,
        ...MATCH_LABEL_TAGS,
      }),
    [modal]
  );

  return <EntryCounts getAtom={getAtom} />;
};
