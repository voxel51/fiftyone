import { graphql } from "react-relay";

export default graphql`
  query paginateGroupQuery(
    $count: Int = 20
    $cursor: String = null
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
    $pinnedSampleFilter: SampleFilter!
  ) {
    ...paginateGroup_query
    ...paginateGroupPinnedSample_query
  }
`;

export const paginateGroupPaginationFragment = graphql`
  fragment paginateGroup_query on Query
  @refetchable(queryName: "paginateGroupPageQuery") {
    samples(
      dataset: $dataset
      view: $view
      first: $count
      after: $cursor
      filter: $filter
    ) @connection(key: "paginateGroup_query_samples") {
      total
      edges {
        cursor
        node {
          __typename
          ... on ImageSample {
            aspectRatio
            sample
          }
          ... on PointCloudSample {
            sample
          }
          ... on VideoSample {
            aspectRatio
            frameRate
            sample
          }
        }
      }
    }
  }
`;

export const paginateGroupPinnedSampleFragment = graphql`
  fragment paginateGroupPinnedSample_query on Query @inline {
    sample(dataset: $dataset, view: $view, filter: $pinnedSampleFilter) {
      __typename
      ... on ImageSample {
        aspectRatio
        sample
      }
      ... on PointCloudSample {
        sample
      }
      ... on VideoSample {
        aspectRatio
        frameRate
        sample
      }
    }
  }
`;
