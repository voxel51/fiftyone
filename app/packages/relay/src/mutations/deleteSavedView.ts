import { graphql } from "react-relay";

export default graphql`
  mutation deleteSavedViewMutation(
    $subscription: String!
    $session: String
    $viewName: String!
    $datasetName: String
  ) {
    deleteSavedView(
      subscription: $subscription
      session: $session
      viewName: $viewName
      datasetName: $datasetName
    )
  }
`;
