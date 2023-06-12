import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query pcdSampleQuery(
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
  ) {
    sample(dataset: $dataset, view: $view, filter: $filter) {
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
