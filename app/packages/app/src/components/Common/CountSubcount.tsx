import { CircularProgress } from "@material-ui/core";
import React, { Suspense } from "react";
import { RecoilValue, useRecoilValue } from "recoil";

import { useTheme } from "../../utils/hooks";

const Loading = () => {
  const theme = useTheme();
  return (
    <CircularProgress
      style={{
        color: theme.fontDark,
        height: 16,
        width: 16,
        margin: 4,
      }}
    />
  );
};

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
    return <Loading />;
  }

  if (count === subcount || count === 0) {
    return <span>{count.toLocaleString()}</span>;
  }

  if (typeof subcount !== "number") {
    return (
      <span style={{ whiteSpace: "nowrap" }}>... {count.toLocaleString()}</span>
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
