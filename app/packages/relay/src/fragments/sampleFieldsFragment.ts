import { graphql } from "relay-runtime";

export default graphql`
  fragment sampleFieldsFragment on Dataset {
    sampleFields {
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
