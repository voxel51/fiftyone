import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query paginateDynamicGroupSampleIdsQuery(
    $count: Int = 20
    $cursor: String = null
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
  ) {
    ...paginateDynamicGroupSampleIds_query
  }
`);

export const paginateDynamicGroupSampleIdsFragment = r(graphql`
  fragment paginateDynamicGroupSampleIds_query on Query
  @refetchable(queryName: "paginateDynamicGroupSampleIdsPageQuery") {
    samples(
      dataset: $dataset
      view: $view
      first: $count
      after: $cursor
      filter: $filter
    ) @connection(key: "PaginateDynamicGroupSampleIdsQuery_samples") {
      total
      edges {
        cursor
        node {
          ... on ImageSample {
            id
          }
          ... on PointCloudSample {
            id
          }
          ... on VideoSample {
            id
          }
        }
      }
    }
  }
`);
