import * as fos from "@fiftyone/state";
import React, { useCallback } from "react";
import { selectorFamily, useRecoilValue } from "recoil";
import { SuspenseEntryCounts } from "../../Common/CountSubcount";

interface PathEntryCountsProps {
  path: string;
  modal: boolean;
}

const showEntryCounts = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "showEntryCounts",
  get:
    (params) =>
    ({ get }) => {
      if (
        params.modal ||
        params.path === "" ||
        params.path === "_" ||
        get(fos.sidebarExpanded(params))
      ) {
        return true;
      }

      return false;
    },
});

export const PathEntryCounts = ({ modal, path }: PathEntryCountsProps) => {
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
  const hasFilters = useRecoilValue(fos.fieldIsFiltered({ modal, path }));
  const queryPerformance = useRecoilValue(fos.queryPerformance) && !modal;
  const shown = useRecoilValue(showEntryCounts({ modal, path }));

  // empty path means we are showing grid sample count which is always allowed
  return (!queryPerformance || hasFilters || path === "") &&
    shown &&
    (path !== "_label_tags" || modal) ? (
    <SuspenseEntryCounts
      countAtom={queryPerformance ? undefined : getAtom(false)}
      subcountAtom={getAtom(true)}
    />
  ) : null;
};

const labelTagCount = selectorFamily<
  number,
  { modal: boolean; tag: string; extended: boolean }
>({
  key: "labelTagCount",
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
  key: "labelTagsCount",
  get:
    (props: { modal: boolean; extended: boolean }) =>
    ({ get }) => {
      if (get(fos.queryPerformance) && !props.modal) {
        return { count: null, results: [] };
      }

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
  if (useRecoilValue(fos.queryPerformance)) {
    return null;
  }
  return (
    <SuspenseEntryCounts
      countAtom={labelTagCount({ modal, tag, extended: false })}
      subcountAtom={labelTagCount({ modal, tag, extended: true })}
    />
  );
};
