import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setFieldVisibilityStageMutation(
    $subscription: String!
    $session: String
    $stage: BSON
  ) {
    setFieldVisibilityStage(
      subscription: $subscription
      session: $session
      stage: $stage
    )
  }
`);
