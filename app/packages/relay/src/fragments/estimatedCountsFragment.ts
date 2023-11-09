import { graphql } from "react-relay";

export default graphql`
  fragment estimatedCountsFragment on Dataset {
    estimatedFrameCount
    estimatedSampleCount
  }
`;
