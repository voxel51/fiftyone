import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setFieldVisibilityStageMutation(
    $subscription: String!
    $session: String
    $input: FieldVisibilityStageInput!
  ) {
    setFieldVisibilityStage(
      subscription: $subscription
      session: $session
      input: $input
    )
  }
`);
