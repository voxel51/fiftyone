import { graphql } from "relay-runtime";

export default graphql`
  fragment stageDefinitionsFragment on Query @inline {
    stageDefinitions {
      name
      params {
        name
        type
        default
        placeholder
      }
    }
  }
`;
