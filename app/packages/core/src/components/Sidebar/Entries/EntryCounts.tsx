import React, { useCallback } from "react";
import { selectorFamily, useRecoilValue } from "recoil";

import * as fos from "@fiftyone/state";

import { SuspenseEntryCounts } from "../../Common/CountSubcount";

import { pathIsExpanded } from "./utils";

const BEST_COUNT = 51000;

const showEntryCounts = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "showEntryCounts",
  get:
    (params) =>
    ({ get }) => {
      const mode = get(fos.sidebarMode(params.modal));
      if (
        params.modal ||
        params.path === "" ||
        mode === "slow" ||
        get(pathIsExpanded(params))
      ) {
        return true;
      }

      if (
        mode === "best" &&
        (get(
          fos.count({ modal: false, extended: false, path: "" })
        ) as number) <= BEST_COUNT
      ) {
        return true;
      }

      return false;
    },
});

export const PathEntryCounts = ({
  modal,
  path,
}: {
  path: string;
  modal: boolean;
}) => {
  const getAtom = useCallback(
    (extended: boolean) =>
      fos.count({
        extended,
        modal,
        path,
      }),
    [modal, path]
  );
  const shown = useRecoilValue(showEntryCounts({ path, modal }));

  return shown ? (
    <SuspenseEntryCounts
      countAtom={getAtom(false)}
      subcountAtom={getAtom(true)}
    />
  ) : null;
};

const labelTagCount = selectorFamily<
  number,
  { modal: boolean; tag: string; extended: boolean }
>({
  key: `labelTagCount`,
  get:
    ({ tag, ...rest }) =>
    ({ get }) =>
      get(
        fos.cumulativeCounts({
          path: tag,
          ...fos.MATCH_LABEL_TAGS,
          ...rest,
        })
      )[tag] || 0,
});

export const tagIsMatched = selectorFamily<
  boolean,
  { key: fos.State.TagKey; tag: string; modal: boolean }
>({
  key: "tagIsActive",
  get:
    ({ key, tag, modal }) =>
    ({ get }) =>
      get(fos.matchedTags({ key, modal })).has(tag),
  set:
    ({ key, tag, modal }) =>
    ({ get, set }, toggle) => {
      const atom = fos.matchedTags({ key, modal });
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
