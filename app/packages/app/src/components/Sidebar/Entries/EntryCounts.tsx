import { CircularProgress } from "@material-ui/core";
import React, { Suspense, useCallback } from "react";
import { RecoilValue, selectorFamily, useRecoilValue } from "recoil";

import * as aggregationAtoms from "../../../recoil/aggregations";
import { matchedTags } from "../../../recoil/filters";
import { State } from "../../../recoil/types";

import { useTheme } from "../../../utils/hooks";
import { MATCH_LABEL_TAGS } from "./utils";

const Loading = () => {
  const theme = useTheme();
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
};

const EntryCounts = ({
  countAtom,
  subcountAtom,
}: {
  countAtom: RecoilValue<number>;
  subcountAtom?: RecoilValue<number>;
}) => {
  const [count, subcount] = [
    useRecoilValue(countAtom),
    subcountAtom ? useRecoilValue(subcountAtom) : null,
  ];

  if (typeof count !== "number") {
    return <Loading />;
  }

  if (count === subcount) {
    return <span>{count.toLocaleString()}</span>;
  }

  if (typeof subcount !== "number") {
    return (
      <span style={{ whiteSpace: "nowrap" }}>... {count.toLocaleString()}</span>
    );
  }

  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {subcount.toLocaleString()} of {count.toLocaleString()}
    </span>
  );
};

const SuspenseEntryCounts = ({
  countAtom,
  subcountAtom,
}: {
  countAtom: RecoilValue<number>;
  subcountAtom: RecoilValue<number>;
}) => {
  return (
    <Suspense fallback={<EntryCounts countAtom={countAtom} />}>
      <EntryCounts countAtom={countAtom} subcountAtom={subcountAtom} />
    </Suspense>
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

  return (
    <EntryCounts countAtom={getAtom(false)} subcountAtom={getAtom(true)} />
  );
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

export const tagIsMatched = selectorFamily<
  boolean,
  { key: State.TagKey; tag: string; modal: boolean }
>({
  key: "tagIsActive",
  get: ({ key, tag, modal }) => ({ get }) =>
    get(matchedTags({ key, modal })).has(tag),
  set: ({ key, tag, modal }) => ({ get, set }, toggle) => {
    const atom = matchedTags({ key, modal });
    const current = get(atom);

    set(
      atom,
      toggle
        ? new Set([tag, ...current])
        : new Set([...current].filter((t) => t !== tag))
    );
  },
});

export const LabelTagCounts = ({
  modal,
  tag,
}: {
  modal: boolean;
  tag: string;
}) => {
  return (
    <SuspenseEntryCounts
      countAtom={labelTagCount({ modal, tag, extended: false })}
      subcountAtom={labelTagCount({ modal, tag, extended: true })}
    />
  );
};
