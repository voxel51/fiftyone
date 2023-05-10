import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setColorSchemeMutation(
    $subscription: String!
    $session: String
    $colorScheme: ColorScheme!
    $saveToApp: Boolean!
  ) {
    setColorScheme(
      subscription: $subscription
      session: $session
      colorScheme: $colorScheme
      saveToApp: $saveToApp
    )
  }
`);
