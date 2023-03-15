import { graphql } from "relay-runtime";

export default graphql`
  fragment frameFieldsFragment on Dataset @inline {
    frameFields {
      ftype
      subfield
      embeddedDocType
      path
      dbField
      description
      info
    }
  }
`;
