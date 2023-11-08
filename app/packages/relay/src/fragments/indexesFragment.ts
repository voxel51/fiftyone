import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  fragment indexesFragment on Dataset {
    frameIndexes {
      name
      unique
      key {
        field
        type
      }
      wildcardProjection {
        fields
        inclusion
      }
    }
    sampleIndexes {
      name
      unique
      key {
        field
        type
      }
      wildcardProjection {
        fields
        inclusion
      }
    }
  }
`);
