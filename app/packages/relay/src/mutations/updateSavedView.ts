import { graphql } from "react-relay";

export default graphql`
  mutation updateSavedViewMutation(
    $subscription: String!
    $session: String
    $viewName: String!
    $datasetName: String
    $updatedInfo: SavedViewInfo!
  ) {
    updateSavedView(
      subscription: $subscription
      session: $session
      viewName: $viewName
      datasetName: $datasetName
      updatedInfo: $updatedInfo
    ) {
      id
      datasetId
      name
      description
      color
      slug
      viewStages
      createdAt
      lastModifiedAt
      lastLoadedAt
    }
  }
`;
