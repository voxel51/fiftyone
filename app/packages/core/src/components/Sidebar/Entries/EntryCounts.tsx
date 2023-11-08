import * as fos from "@fiftyone/state";
import React, { useCallback } from "react";
import { selector, selectorFamily, useRecoilValue } from "recoil";
import { SuspenseEntryCounts } from "../../Common/CountSubcount";
import { pathIsExpanded } from "./utils";

interface PathEntryCountsProps {
  path: string;
  modal: boolean;
  ignoreSidebarMode?: boolean;
}

const showEntryCounts = selectorFamily<
  boolean,
  { always?: boolean; path: string; modal: boolean }
>({
  key: "showEntryCounts",
  get:
    (params) =>
    ({ get }) => {
      const mode = get(fos.resolvedSidebarMode(params.modal));

      if (
        params.always ||
        params.modal ||
        params.path === "" ||
        mode === "all" ||
        get(pathIsExpanded(params))
      ) {
        return true;
      }

      return false;
    },
});

const count = selector({
  key: "countTmp",
  get: ({ get }) => get(fos.estimatedCounts)?.estimatedSampleCount || 0,
});

export const PathEntryCounts = ({
  modal,
  path,
  ignoreSidebarMode,
}: PathEntryCountsProps) => {
  const getAtom = useCallback(
    (extended: boolean) => {
      return fos.count({
        extended,
        modal,
        path,
      });
    },
    [modal, path]
  );

  const shown = useRecoilValue(
    showEntryCounts({ path, modal, always: ignoreSidebarMode })
  );
  const f = useRecoilValue(fos.hasFilters(false));

  return shown ? (
    <SuspenseEntryCounts
      countAtom={path === "" ? count : getAtom(false)}
      subcountAtom={f ? getAtom(true) : count}
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
    ({ get }) => {
      const labeltags = get(
        fos.cumulativeCounts({
          ...fos.MATCH_LABEL_TAGS,
          ...rest,
        })
      );
      return labeltags[tag] ?? 0;
    },
});

export const labelTagsCount = selectorFamily<
  { count: number; results: [string, number][] },
  { modal: boolean; extended: boolean }
>({
  key: `labelTagsCount`,
  get:
    ({ ...props }) =>
    ({ get }) => {
      const labelTagObj = get(
        fos.cumulativeCounts({
          ...fos.MATCH_LABEL_TAGS,
          ...props,
        })
      );
      if (!labelTagObj) return { count: 0, results: [] };
      const labelTags = Object.entries(labelTagObj);
      const count = labelTags.reduce((acc, [key, value]) => acc + value, 0);
      return { count, results: labelTags };
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
