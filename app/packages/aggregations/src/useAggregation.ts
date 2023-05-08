import React from "react";
import Aggregation from "./Aggregation";
import { getFetchFunction } from "@fiftyone/utilities";

const AGGREGATE_ROUTE = "/aggregate";

type AggregationParams = {
  view?: any;
  filters?: any;
  dataset?: any;
  sample_ids?: any;
};

/**
 * A hook for aggregating data from the **FiftyOne** backend.
 *
 * **Aggregation Classes**
 *
 * .. csv-table::
 *    :header: "JavaScript", "Python"
 *
 *    :js:class:`Values`, :py:class:`fiftyone.core.aggregations.Values`
 *    :js:class:`Bounds`, :py:class:`fiftyone.core.aggregations.Bounds`
 *    :js:class:`Count`, :py:class:`fiftyone.core.aggregations.Count`
 *    :js:class:`CountValues`, :py:class:`fiftyone.core.aggregations.CountValues`
 *    :js:class:`Distinct`, :py:class:`fiftyone.core.aggregations.Distinct`
 *    :js:class:`HistogramValues`, :py:class:`fiftyone.core.aggregations.HistogramValues`
 *    :js:class:`Mean`, :py:class:`fiftyone.core.aggregations.Mean`
 *    :js:class:`Std`, :py:class:`fiftyone.core.aggregations.Std`
 *    :js:class:`Sum`, :py:class:`fiftyone.core.aggregations.Sum`
 *    :js:class:`Values`, :py:class:`fiftyone.core.aggregations.Values`
 *
 * @example
 * ```typescript
 * const [aggregate, points, loading] = foa.useAggregation({
 *   dataset,
 *   filters,
 *   view,
 * });
 *
 * React.useEffect(() => {
 *   aggregate(
 *     [
 *       new foa.aggregations.Values({
 *         fieldOrExpr: "id",
 *       }),
 *       new foa.aggregations.Values({
 *         fieldOrExpr: `${path}.point.coordinates`,
 *       }),
 *     ],
 *     dataset.name
 *   );
 * }, [dataset, filters, view, path]);
 * ```
 *
 * @param options AggregationParams
 * @returns
 */
export default function useAggregation({
  view,
  filters,
  dataset,
  sample_ids,
}: AggregationParams = {}) {
  const [isLoading, setLoading] = React.useState(true);
  const [result, setResult] = React.useState(null);

  const aggregate = async (
    aggregations: Aggregation[],
    datasetName?: string
  ) => {
    setLoading(true);
    const jsonAggregations = aggregations.map((a) => a.toJSON());

    const resBody = (await getFetchFunction()("POST", AGGREGATE_ROUTE, {
      filters, // extended view
      view,
      dataset: datasetName || dataset.name,
      sample_ids,
      aggregations: jsonAggregations,
    })) as any;
    setResult(resBody.aggregate);
    setLoading(false);
  };

  return [aggregate, result, isLoading];
}
