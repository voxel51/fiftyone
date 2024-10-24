import * as fos from "@fiftyone/state";
import { count, pathColor } from "@fiftyone/state";
import React, { Suspense, useEffect } from "react";
import { useRecoilValue } from "recoil";
import FilterItem from "./FilterItem";
import useFilterData from "./useFilterData";

const LABEL_TAGS = "_label_tags";
const TIMEOUT = 5000;

class QueryPerformanceToast extends Event {
  constructor() {
    super("queryperformance");
  }
}

const QueryPerformanceDispatcher = () => {
  useEffect(() => {
    const timeout = setTimeout(() => {
      window.dispatchEvent(new QueryPerformanceToast());
    }, TIMEOUT);

    return () => clearTimeout(timeout);
  }, []);
  return null;
};

const QueryPerformanceSubscriber = ({ path }: { path: string }) => {
  useRecoilValue(count({ extended: false, modal: false, path }));
  return null;
};

const QueryPerformance = ({ path }: { path: string }) => {
  const queryPerformance = useRecoilValue(fos.queryPerformance);

  if (queryPerformance || path === LABEL_TAGS || !path) {
    return null;
  }

  return (
    <Suspense fallback={<QueryPerformanceDispatcher />}>
      <QueryPerformanceSubscriber path={path} />
    </Suspense>
  );
};

const FilterablePathEntries = ({
  modal,
  path,
  ...events
}: {
  modal: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  path: string;
}) => {
  const { data } = useFilterData(modal, path);
  const color = useRecoilValue(pathColor(path));

  return (
    <>
      {!modal && <QueryPerformance path={path} />}
      <>
        {data.map(({ color: _, ...props }) => (
          <FilterItem key={props.path} color={color} {...events} {...props} />
        ))}
      </>
    </>
  );
};

export default FilterablePathEntries;
