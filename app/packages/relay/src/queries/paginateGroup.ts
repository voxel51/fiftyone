import { graphql } from "react-relay";
import r from "../resolve";

export default r(graphql`
  query paginateGroupQuery(
    $count: Int = 20
    $cursor: String = null
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
  ) {
    samples(
      dataset: $dataset
      view: $view
      first: $count
      after: $cursor
      filter: $filter
    ) {
      pageInfo {
        hasNextPage
      }
      edges {
        cursor
        node {
          __typename
          ... on ImageSample {
            id
            aspectRatio
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
            id
            aspectRatio
            frameRate
            frameNumber
            sample
            urls {
              field
              url
            }
          }
        }
      }
    }
  }
`);
