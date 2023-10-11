import { graphql } from "relay-runtime";

export default graphql`
  fragment stageDefinitionsFragment on Query {
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
