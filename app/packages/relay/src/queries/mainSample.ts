import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query mainSampleQuery(
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
    $filters: JSON
    $index: Int!
  ) {
    sample(
      dataset: $dataset
      view: $view
      filters: $filters
      filter: $filter
      index: $index
    ) {
      __typename
      ... on ImageSample {
        id
        sample
        urls {
          field
          url
        }
      }
      ... on VideoSample {
        id
        sample
        frameRate
        urls {
          field
          url
        }
      }
    }
  }
`);
