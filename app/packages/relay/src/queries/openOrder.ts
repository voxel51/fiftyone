import { graphql } from "react-relay";
import r from "../resolve";

export default r(graphql`
  query openOrderQuery(
    $input: OrderInput!
    $withFirstPage: Boolean = false
    $count: Int = 50
    $filter: SampleFilter = null
    $paginationData: Boolean = true
    $maxQueryTime: Int = null
  ) {
    openOrder(input: $input) {
      __typename
      ... on Order {
        token
        mode
        total
        bounds {
          min
          max
          scale
        }
        ticks {
          fraction
          label
        }
        firstPage(
          count: $count
          filter: $filter
          paginationData: $paginationData
          maxQueryTime: $maxQueryTime
        ) @include(if: $withFirstPage) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            endCursor
            startCursor
          }
          edges {
            cursor
            fraction
            offset
            value
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
      ... on OrderUnavailable {
        reason
      }
    }
  }
`);
