import { graphql } from "relay-runtime";

export default graphql`
  fragment snapshotFragment on Dataset {
    headName
    snapshotName
  }
`;
