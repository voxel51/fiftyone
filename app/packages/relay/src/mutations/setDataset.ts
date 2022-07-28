import { graphql } from "react-relay";

export default graphql`
  mutation setDatasetMutation(
    $subscription: String!
    $session: String
    $name: String
  ) {
    setDataset(subscription: $subscription, session: $session, name: $name)
  }
`;
