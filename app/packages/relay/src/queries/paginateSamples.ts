import { graphql } from "react-relay";
import r from "../resolve";

export default r(graphql`
  query paginateSamplesQuery(
    $count: Int = 20
    $after: String = null
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
    $filters: BSON = null
    $extendedStages: BSON
    $paginationData: Boolean = true
    $sortBy: String
    $desc: Boolean
    $hint: String
    $dynamicGroup: BSON = null
    $maxQueryTime: Int
  ) {
    samples(
      dataset: $dataset
      view: $view
      first: $count
      after: $after
      filter: $filter
      filters: $filters
      extendedStages: $extendedStages
      paginationData: $paginationData
      sortBy: $sortBy
      desc: $desc
      hint: $hint
      dynamicGroup: $dynamicGroup
      maxQueryTime: $maxQueryTime
    ) {
      __typename
      ... on QueryTimeout {
        queryTime
      }
      ... on SampleItemStrConnection {
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
            ... on ThreeDSample {
              id
              aspectRatio
              sample
              urls {
                field
                url
              }
            }
            ... on UnknownSample {
              id
              aspectRatio
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
  }
`);
