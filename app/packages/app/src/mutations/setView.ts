import { graphql } from "relay-runtime";

export default graphql`
  mutation setViewMutation(
    $subscription: String!
    $session: String
    $view: JSONArray!
  ) {
    setView(subscription: $subscription, session: $session, view: $view)
  }
`;
