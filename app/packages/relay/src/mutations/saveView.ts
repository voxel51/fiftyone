import { graphql } from "react-relay";

export default graphql`
  mutation saveViewMutation(
    $subscription: String!
    $session: String
    $viewName: String!
    $description: String = null
    $color: String = null
  ) {
    saveView(
      subscription: $subscription
      session: $session
      viewName: $viewName
      description: $description
      color: $color
    )
  }
`;
