import React from 'react'
import Aggregation from './Aggregation'
import {getFetchFunction} from '@fiftyone/utilities';

const AGGREGATE_ROUTE = "/aggregate";

type AggregationParams = {
  view?: any;
  filters?: any;
  dataset?: any;
  sample_ids?: any;
};

export default function useAggregation({
  view,
  filters,
  dataset,
  sample_ids,
}: AggregationParams = {}) {
  const [isLoading, setLoading] = React.useState(true);
  const [result, setResult] = React.useState(null);
  // const dataset = useRecoilValue(atoms.dataset)

  const aggregate = async (
    aggregations: Aggregation[],
    datasetName?: string
  ) => {
    const jsonAggregations = aggregations.map((a) => a.toJSON());

    const resBody = (await getFetchFunction()("POST", AGGREGATE_ROUTE, {
      filters: filters, // extended view
      view: view,
      dataset: datasetName || dataset.name,
      sample_ids: sample_ids,
      aggregations: jsonAggregations,
    })) as any;
    setResult(resBody.aggregate);
    setLoading(false);
  };

  return [aggregate, result, isLoading];
}