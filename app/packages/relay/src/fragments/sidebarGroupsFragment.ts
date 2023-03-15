import { graphql } from "relay-runtime";

export default graphql`
  fragment sidebarGroupsFragment on Dataset @inline {
    frameFields {
      ftype
      subfield
      embeddedDocType
      path
      dbField
      description
      info
    }
    sampleFields {
      ftype
      subfield
      embeddedDocType
      path
      dbField
      description
      info
    }
    appConfig {
      sidebarGroups {
        expanded
        paths
        name
      }
    }
  }
`;
