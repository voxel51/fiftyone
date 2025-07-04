import { LoadingDots } from "@fiftyone/components";
import { AggregationQueryTimeout } from "@fiftyone/state";
import React, { Suspense } from "react";
import type { RecoilValue } from "recoil";
import { constSelector, useRecoilValue, useRecoilValueLoadable } from "recoil";
import TimedOut from "../Common/TimedOut";

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
  // only subcounts have a timeout
  const subResult = useRecoilValueLoadable(subcountAtom);

  if (
    subResult.state === "hasError" &&
    subResult.contents instanceof AggregationQueryTimeout
  ) {
    return <TimedOut queryTime={subResult.contents.queryTime} />;
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
