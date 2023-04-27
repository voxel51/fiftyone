import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query pcdSampleQuery(
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
    $index: Int!
  ) {
    sample(dataset: $dataset, view: $view, filter: $filter, index: $index) {
      ... on PointCloudSample {
        id
        sample
        urls {
          field
          url
        }
      }
    }
  }
`);
