import { graphql } from "relay-runtime";

export default graphql`
  fragment sampleFieldsFragment on Dataset @inline {
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
