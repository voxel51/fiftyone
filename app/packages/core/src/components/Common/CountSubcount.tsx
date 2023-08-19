import React, { Suspense } from "react";
import { RecoilValue, useRecoilValue } from "recoil";
import LoadingDots from "../../../../components/src/components/Loading/LoadingDots";

const EntryCounts = ({
  countAtom,
  subcountAtom,
}: {
  countAtom?: RecoilValue<number>;
  subcountAtom?: RecoilValue<number>;
}) => {
  const [count, subcount] = [
    countAtom ? useRecoilValue(countAtom) : null,
    subcountAtom ? useRecoilValue(subcountAtom) : null,
  ];

  if (typeof count !== "number") {
    return <LoadingDots text="" />;
  }

  if (!["number", "undefined"].includes(typeof subcount)) {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        <LoadingDots text="" /> {count.toLocaleString()}
      </span>
    );
  }

  if (count === subcount || count === 0) {
    return <span data-cy="entry-count-all">{count!.toLocaleString()}</span>;
  }

  return (
    <span style={{ whiteSpace: "nowrap" }} data-cy="entry-count-part">
      {subcount?.toLocaleString() ?? "0"} of {count.toLocaleString()}
    </span>
  );
};

export const SuspenseEntryCounts = ({
  countAtom,
  subcountAtom,
}: {
  countAtom: RecoilValue<number>;
  subcountAtom: RecoilValue<number>;
}) => {
  return (
    <Suspense fallback={<EntryCounts />}>
      <Suspense fallback={<EntryCounts countAtom={countAtom} />}>
        <EntryCounts countAtom={countAtom} subcountAtom={subcountAtom} />
      </Suspense>
    </Suspense>
  );
};
