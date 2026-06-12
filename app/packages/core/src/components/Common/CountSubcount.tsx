import { LoadingDots } from "@fiftyone/components";
import React, { Suspense } from "react";
import type { RecoilValue } from "recoil";
import { constSelector, useRecoilValue, useRecoilValueLoadable } from "recoil";
import TimedOutCounts, { isAggregationTimeout } from "../Common/TimedOutCounts";

const CONST_SELECTOR = constSelector(null);

const EntryCounts = ({
  countAtom = CONST_SELECTOR,
  subcountAtom = CONST_SELECTOR,
}: {
  countAtom?: RecoilValue<number | null>;
  subcountAtom?: RecoilValue<number | null>;
}) => {
  const [count, subcount] = [
    useRecoilValue(countAtom),
    useRecoilValue(subcountAtom),
  ];
  if (countAtom !== CONST_SELECTOR && typeof count !== "number") {
    return <LoadingDots text="" />;
  }

  if (!["number", "undefined"].includes(typeof subcount)) {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        <LoadingDots text="" /> {count?.toLocaleString()}
      </span>
    );
  }

  if (count === subcount || count === 0) {
    return <span data-cy="entry-count-all">{count?.toLocaleString()}</span>;
  }

  if (countAtom !== CONST_SELECTOR) {
    return (
      <span style={{ whiteSpace: "nowrap" }} data-cy="entry-count-part">
        {subcount?.toLocaleString()} of {count?.toLocaleString()}
      </span>
    );
  }

  return (
    <span style={{ whiteSpace: "nowrap" }} data-cy="entry-count-part">
      {subcount?.toLocaleString() ?? 0}
    </span>
  );
};

const EntryCountsContainer = ({
  countAtom = CONST_SELECTOR,
  subcountAtom = CONST_SELECTOR,
}: {
  countAtom?: RecoilValue<number | null>;
  subcountAtom?: RecoilValue<number | null>;
}) => {
  const countResult = useRecoilValueLoadable(countAtom);
  const subResult = useRecoilValueLoadable(subcountAtom);

  // a timed-out count for this path shows a marker instead of erroring the page;
  // other fields keep their counts
  for (const result of [countResult, subResult]) {
    if (result.state === "hasError") {
      if (isAggregationTimeout(result.contents)) {
        return <TimedOutCounts />;
      }
      throw result.contents;
    }
  }

  return <EntryCounts countAtom={countAtom} subcountAtom={subcountAtom} />;
};

export const SuspenseEntryCounts = ({
  countAtom,
  subcountAtom,
}: {
  countAtom?: RecoilValue<number>;
  subcountAtom?: RecoilValue<number>;
}) => {
  return (
    <Suspense fallback={<EntryCounts />}>
      <Suspense fallback={<EntryCounts countAtom={countAtom} />}>
        <EntryCountsContainer
          countAtom={countAtom}
          subcountAtom={subcountAtom}
        />
      </Suspense>
    </Suspense>
  );
};
