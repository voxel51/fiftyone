import * as foa from "@fiftyone/aggregations";
import React from "react";

const useGeoLocations = ({
  path,
  dataset,
  filters,
  view,
}): { loading: boolean; coordinates?: any; samples?: string[] } => {
  const [aggregate, points, loading] = foa.useAggregation({
    dataset,
    filters,
    view,
  });

  React.useEffect(() => {
    aggregate(
      [
        new foa.aggregations.Values({
          fieldOrExpr: "id",
        }),
        new foa.aggregations.Values({
          fieldOrExpr: `${path}.point.coordinates`,
        }),
      ],
      dataset.name
    );
  }, [dataset, filters, view, path]);

  const coordinates = React.useMemo(
    () => (points && points.length ? points[1].map((c) => [c[1], c[0]]) : []),
    [points]
  );

  if (loading) {
    return { loading };
  }

  const [samples] = points;

  return {
    loading: false,
    samples,
    coordinates,
  };
};

export default useGeoLocations;
