import { graphql } from "relay-runtime";

export default graphql`
  fragment frameFieldsFragment on Dataset {
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
