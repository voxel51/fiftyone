import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setColorSchemeMutation(
    $subscription: String!
    $colorScheme: ColorSchemeInput!
  ) {
    setColorScheme(subscription: $subscription, colorScheme: $colorScheme) {
      ...colorSchemeFragment
    }
  }
`);
