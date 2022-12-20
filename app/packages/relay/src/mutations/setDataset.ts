import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setDatasetMutation(
    $subscription: String!
    $session: String
    $name: String
  ) {
    setDataset(subscription: $subscription, session: $session, name: $name)
  }
`);
