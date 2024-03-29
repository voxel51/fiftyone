import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query mainSampleQuery(
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
    $filters: JSON
  ) {
    sample(dataset: $dataset, view: $view, filters: $filters, filter: $filter) {
      __typename
      ... on ImageSample {
        aspectRatio
        id
        sample
        urls {
          field
          url
        }
      }
      ... on PointCloudSample {
        aspectRatio
        id
        sample
        urls {
          field
          url
        }
      }
      ... on VideoSample {
        aspectRatio
        id
        frameRate
        frameNumber
        sample
        urls {
          field
          url
        }
      }
      ... on ThreeDSample {
        aspectRatio
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
