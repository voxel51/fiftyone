import * as fos from "@fiftyone/state";
import React, { useCallback } from "react";
import { selectorFamily, useRecoilValue } from "recoil";
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

export const PathEntryCounts = ({
  modal,
  path,
  ignoreSidebarMode,
}: PathEntryCountsProps) => {
  const getAtom = useCallback(
    (extended: boolean) =>
      fos.count({
        extended,
        modal,
        path,
      }),
    [modal, path]
  );

  const shown = useRecoilValue(
    showEntryCounts({ path, modal, always: ignoreSidebarMode })
  );

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

export const labelTagsCount = selectorFamily({
  key: `labelTagsCount`,
  get:
    (props: { modal: boolean; extended: boolean }) =>
    ({ get }) => {
      const labelTagObj = get(
        fos.cumulativeCounts({
          ...fos.MATCH_LABEL_TAGS,
          ...props,
        })
      );
      if (!labelTagObj) return { count: 0, results: [] };
      const labelTags = Object.entries(labelTagObj).map(([value, count]) => ({
        value,
        count,
      }));
      const count = labelTags.reduce((acc, { count }) => acc + count, 0);
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
