import { graphql } from "relay-runtime";

export default graphql`
  mutation setDatasetMutation(
    $subscription: String!
    $session: String
    $name: String
  ) {
    setDataset(subscription: $subscription, session: $session, name: $name)
  }
`;
