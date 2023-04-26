import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setColorSchemeMutation(
    $subscription: String!
    $session: String
    $dataset: String!
    $stages: BSONArray!
    $colorScheme: ColorScheme!
    $saveToApp: Boolean!
    $colorSchemeSaveFormat: ColorSchemeSaveFormat!
  ) {
    setColorScheme(
      subscription: $subscription
      session: $session
      dataset: $dataset
      stages: $stages
      colorScheme: $colorScheme
      saveToApp: $saveToApp
      colorSchemeSaveFormat: $colorSchemeSaveFormat
    )
  }
`);
