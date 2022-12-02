import { graphql } from "react-relay";

export default graphql`
  mutation updateSavedViewMutation(
    $subscription: String!
    $session: String
    $viewName: String!
    $updatedInfo: SavedViewInfo!
  ) {
    updateSavedView(
      subscription: $subscription
      session: $session
      viewName: $viewName
      updatedInfo: $updatedInfo
    ) {
      id
      name
      slug
      description
      color
      viewStages
      createdAt
      lastModifiedAt
      lastLoadedAt
    }
  }
`;
