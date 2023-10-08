import { graphql } from "relay-runtime";

export default graphql`
  fragment groupSliceFragment on Dataset {
    defaultGroupSlice
  }
`;
