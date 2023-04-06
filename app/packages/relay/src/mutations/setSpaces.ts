import { graphql } from "react-relay";

export default graphql`
  mutation setSpacesMutation(
    $subscription: String!
    $session: String
    $spaces: BSON!
  ) {
    setSpaces(subscription: $subscription, session: $session, spaces: $spaces)
  }
`;
