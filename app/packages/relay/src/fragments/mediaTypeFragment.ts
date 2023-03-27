import { graphql } from "relay-runtime";

export default graphql`
  fragment mediaTypeFragment on Dataset @inline {
    mediaType
  }
`;
