import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setDatasetColorSchemeMutation(
    $subscription: String!
    $datasetName: String!
    $colorScheme: ColorSchemeInput
  ) {
    setDatasetColorScheme(
      subscription: $subscription
      datasetName: $datasetName
      colorScheme: $colorScheme
    )
  }
`);
