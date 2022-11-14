import { graphql } from "react-relay";

export default graphql`
  mutation deleteViewMutation(
    $subscription: String!
    $session: String
    $viewName: String!
  ) {
    deleteView(
      subscription: $subscription
      session: $session
      viewName: $viewName
    )
  }
`;
