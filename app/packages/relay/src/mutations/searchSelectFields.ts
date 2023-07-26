import { graphql } from "react-relay";

export default graphql`
  mutation searchSelectFieldsMutation(
    $datasetName: String!
    $metaFilter: JSON = null
  ) {
    searchSelectFields(datasetName: $datasetName, metaFilter: $metaFilter)
  }
`;
