import { graphql } from "relay-runtime";

export default graphql`
  fragment stageDefinitionsFragment on Query {
    stageDefinitions {
      name
      params {
        name
        type
        tokens
        nullable
        required
        default
        placeholder
        choices {
          source
          values
          fields {
            level
            existence
            ftypes
            labelTypes
          }
        }
      }
    }
  }
`;
