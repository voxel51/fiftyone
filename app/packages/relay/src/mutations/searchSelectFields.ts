import { graphql } from "react-relay";

export default graphql`
  mutation searchSelectFieldsMutation($metaFilter: JSON = null) {
    searchSelectFields(metaFilter: $metaFilter) {
      path
    }
  }
`;
