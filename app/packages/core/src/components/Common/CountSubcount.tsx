import { LoadingDots } from "@fiftyone/components";
import { getEventBus } from "@fiftyone/events";
import { AggregationQueryTimeout } from "@fiftyone/state";
import { Suspense, useEffect } from "react";
import type { RecoilValue } from "recoil";
import { constSelector, useRecoilValue, useRecoilValueLoadable } from "recoil";
import TimedOut from "../Common/TimedOut";

const CONST_SELECTOR = constSelector(null);

/** e2e specs wait on a signaled count (the grid's) showing its loaded value */
type EntryCountsE2EEvents = {
  "e2e:components:entry-count-shown": { signal: string };
};

/** Signal, as `signal`, that loaded counts have rendered */
const CountShownSignal = ({ signal }: { signal: string }) => {
  useEffect(() => {
    getEventBus<EntryCountsE2EEvents>().dispatch(
      "e2e:components:entry-count-shown",
      { signal },
    );
  });
  return null;
};

const EntryCounts = ({
  countAtom = CONST_SELECTOR,
  subcountAtom = CONST_SELECTOR,
  signal,
}: {
  countAtom?: RecoilValue<number | null>;
  subcountAtom?: RecoilValue<number | null>;
  signal?: string;
}) => {
  const [count, subcount] = [
    useRecoilValue(countAtom),
    useRecoilValue(subcountAtom),
  ];
  const shown = signal ? <CountShownSignal signal={signal} /> : null;
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
    return (
      <span data-cy="entry-count-all">
        {count?.toLocaleString()}
        {shown}
      </span>
    );
  }

  if (countAtom !== CONST_SELECTOR) {
    return (
      <span style={{ whiteSpace: "nowrap" }} data-cy="entry-count-part">
        {subcount?.toLocaleString()} of {count?.toLocaleString()}
        {shown}
      </span>
    );
  }

  return (
    <span style={{ whiteSpace: "nowrap" }} data-cy="entry-count-part">
      {subcount?.toLocaleString() ?? 0}
      {shown}
    </span>
  );
};

const EntryCountsContainer = ({
  countAtom = CONST_SELECTOR,
  subcountAtom = CONST_SELECTOR,
  signal,
}: {
  countAtom?: RecoilValue<number | null>;
  subcountAtom?: RecoilValue<number | null>;
  signal?: string;
}) => {
  // only subcounts have a timeout
  const subResult = useRecoilValueLoadable(subcountAtom);

  if (
    subResult.state === "hasError" &&
    subResult.contents instanceof AggregationQueryTimeout
  ) {
    return <TimedOut queryTime={subResult.contents.queryTime} />;
  }

  return (
    <EntryCounts
      countAtom={countAtom}
      subcountAtom={subcountAtom}
      signal={signal}
    />
  );
};

export const SuspenseEntryCounts = ({
  countAtom,
  subcountAtom,
  signal,
}: {
  countAtom?: RecoilValue<number>;
  subcountAtom?: RecoilValue<number>;
  /** An e2e name to signal the loaded counts under */
  signal?: string;
}) => {
  return (
    <Suspense fallback={<EntryCounts />}>
      <Suspense fallback={<EntryCounts countAtom={countAtom} />}>
        <EntryCountsContainer
          countAtom={countAtom}
          subcountAtom={subcountAtom}
          signal={signal}
        />
      </Suspense>
    </Suspense>
  );
};
