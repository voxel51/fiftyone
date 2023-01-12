import { graphql } from "react-relay";

export default graphql`
  mutation setSpacesMutation(
    $subscription: String!
    $session: String
    $spaces: JSON!
  ) {
    setSpaces(subscription: $subscription, session: $session, spaces: $spaces)
  }
`;
