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

  if (count === subcount || count === 0) {
    return <span>{count.toLocaleString()}</span>;
  }

  if (typeof subcount !== "number") {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        <LoadingDots text="" /> {count.toLocaleString()}
      </span>
    );
  }

  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {subcount.toLocaleString()} of {count.toLocaleString()}
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
