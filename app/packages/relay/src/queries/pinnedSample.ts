import { graphql } from "react-relay";

export default graphql`
  query pinnedSampleQuery(
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
`;
