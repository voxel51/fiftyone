import * as foa from "@fiftyone/aggregations";
import * as fos from "@fiftyone/state";
import { Stage } from "@fiftyone/utilities";
import React from "react";

const useGeoLocations = ({
  path,
  dataset,
  filters,
  view,
}: {
  path: string;
  dataset: fos.State.Dataset;
  view: Stage[];
  filters: fos.State.Filters;
}): {
  loading: boolean;
  samples: {
    [key: string]: [number, number];
  };
} => {
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

  return {
    loading,
    samples: React.useMemo(
      () =>
        points
          ? points[0].reduce((acc, id, i) => {
              if (points[1][i]) {
                acc[id] = points[1][i];
              }
              return acc;
            }, {})
          : {},
      [points]
    ),
  };
};

export default useGeoLocations;
