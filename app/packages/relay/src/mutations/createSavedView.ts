import { graphql } from "react-relay";

export default graphql`
  mutation createSavedViewMutation(
    $subscription: String!
    $session: String
    $viewName: String!
    $viewStages: BSONArray
    $datasetName: String = null
    $description: String = null
    $color: String = null
    $form: StateForm = null
  ) {
    createSavedView(
      subscription: $subscription
      session: $session
      viewName: $viewName
      viewStages: $viewStages
      datasetName: $datasetName
      description: $description
      color: $color
      form: $form
    ) {
      id
      datasetId
      name
      description
      slug
      color
      viewStages
      createdAt
    }
  }
`;
