import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setDatasetColorSchemeMutation(
    $datasetName: String!
    $colorScheme: ColorSchemeInput
  ) {
    setDatasetColorScheme(datasetName: $datasetName, colorScheme: $colorScheme)
  }
`);
