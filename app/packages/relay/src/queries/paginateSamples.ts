import { graphql } from "react-relay";
import r from "../resolve";
import type { paginateSamplesQuery$data } from "./__generated__/paginateSamplesQuery.graphql";

/**
 * The successful `SampleItemStrConnection` branch of `samples`, with the
 * `QueryTimeout` and `%other` union members removed. Use this when narrowing
 * `paginateSamplesQuery` results before accessing `edges` / `pageInfo`.
 */
export type PaginateSamplesConnection = Exclude<
  Exclude<
    paginateSamplesQuery$data["samples"],
    { readonly __typename: "QueryTimeout" }
  >,
  { readonly __typename: "%other" }
>;

/**
 * A concrete sample node from `paginateSamplesQuery`, with the `QueryTimeout`,
 * `%other` connection variants and the `%other` node variant all narrowed
 * away. Consumers can treat the result as one of the known sample types
 * ({@link ImageSample}, {@link PointCloudSample}, etc.).
 */
export type PaginateSamplesNode = Exclude<
  PaginateSamplesConnection["edges"][number]["node"],
  { readonly __typename: "%other" }
>;

/**
 * Type guard for {@link PaginateSamplesConnection}. Returns `true` when
 * `samples` is the successful connection variant and `edges` / `pageInfo` are
 * safe to access.
 */
export const isPaginateSamplesConnection = (
  samples: paginateSamplesQuery$data["samples"]
): samples is PaginateSamplesConnection =>
  samples.__typename === "SampleItemStrConnection";

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
