import { useCallback } from "react";
import { selectorFamily, useRecoilValueLoadable } from "recoil";

import * as fos from "@fiftyone/state";

import { SuspenseEntryCounts } from "../../Common/CountSubcount";

import LoadingDots from "../../../../../components/src/components/Loading/LoadingDots";
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
    (extended: boolean) => {
      return fos.count({
        extended,
        modal,
        path,
      });
    },
    [modal, path]
  );

  const shown = useRecoilValueLoadable(
    showEntryCounts({ path, modal, always: ignoreSidebarMode })
  );
  if (shown.state === "hasError") {
    throw shown.contents;
  }

  return shown.state === "loading" ? (
    <LoadingDots text="" />
  ) : shown.contents ? (
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
