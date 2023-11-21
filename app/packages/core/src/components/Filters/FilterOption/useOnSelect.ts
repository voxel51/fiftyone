import { isFilterDefault, isSidebarFilterMode } from "@fiftyone/state";
import React from "react";
import {
  RecoilState,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import { Option, OptionKey } from "./useOptions";

export default function ({
  close,
  excludeAtom,
  isMatchingAtom,
  options,
  modal,
  path,
}: {
  close: () => void;
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  options: Option[];
  modal: boolean;
  path: string;
}) {
  const [excluded, setExcluded] = useRecoilState(excludeAtom);
  const [isMatching, setIsMatching] = useRecoilState(isMatchingAtom);
  const defaultToFilter = useRecoilValue(isFilterDefault({ modal, path }));

  const [filterKey, setFilterKey] = React.useState<OptionKey>(() => {
    if (defaultToFilter) return !excluded ? "filter" : "negativeFilter";
    return !excluded ? "match" : "negativeMatch";
  });
  const [visibilityKey, setVisibilityKey] = React.useState<OptionKey>(() => {
    return !excluded ? "visible" : "notVisible";
  });
  const isFilterMode = useRecoilValue(isSidebarFilterMode);
  const selected = options.find(
    (o) => o.key === (isFilterMode ? filterKey : visibilityKey)
  )?.value;

  const onSelectFilter = () => {
    excluded && setExcluded(false);
    isMatching && setIsMatching(false);
  };

  const onSelectNegativeFilter = () => {
    !excluded && setExcluded(true);
    isMatching && setIsMatching(false);
  };

  const onSelectMatch = () => {
    excluded && setExcluded(false);
    !isMatching && setIsMatching(true);
  };

  const onSelectNegativeMatch = () => {
    !excluded && setExcluded(true);
    !isMatching && setIsMatching(true);
  };

  const onSelectVisible = () => {
    excluded && setExcluded(false);
  };

  const onSelectNotVisible = () => {
    !excluded && setExcluded(true);
  };

  return {
    filterKey,
    visibilityKey,
    onSelect: useRecoilCallback(
      ({ snapshot }) =>
        async (key: OptionKey) => {
          const isFilterMode = await snapshot.getPromise(isSidebarFilterMode);
          isFilterMode ? setFilterKey(key) : setVisibilityKey(key);
          close();
          switch (key) {
            case "filter":
              onSelectFilter();
              break;
            case "negativeFilter":
              onSelectNegativeFilter();
              break;
            case "match":
              onSelectMatch();
              break;
            case "negativeMatch":
              onSelectNegativeMatch();
              break;
            case "visible":
              onSelectVisible();
              break;
            case "notVisible":
              onSelectNotVisible();
              break;
          }
        },
      [close]
    ),
    selected,
  };
}
