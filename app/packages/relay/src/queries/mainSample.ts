import { graphql } from "react-relay";

export default graphql`
  query mainSampleQuery(
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
  ) {
    sample(dataset: $dataset, view: $view, filter: $filter) {
      ... on ImageSample {
        sample
      }
      ... on VideoSample {
        sample
        frameRate
      }
    }
  }
`;
