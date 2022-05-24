import React, { useCallback } from "react";
import { selectorFamily } from "recoil";

import * as aggregationAtoms from "../../../recoil/aggregations";
import { matchedTags } from "../../../recoil/filters";
import { State } from "../../../recoil/types";

import { SuspenseEntryCounts } from "../../Common/CountSubcount";
import { MATCH_LABEL_TAGS } from "../utils";

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
    <SuspenseEntryCounts
      countAtom={getAtom(false)}
      subcountAtom={getAtom(true)}
    />
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
    )[tag] || 0,
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
