import { graphql } from "relay-runtime";

export default graphql`
  fragment mediaFieldsFragment on Dataset {
    name
    appConfig {
      gridMediaField
    }
    sampleFields {
      path
    }
  }
`;
