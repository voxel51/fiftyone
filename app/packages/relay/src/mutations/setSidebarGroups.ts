import { graphql } from "react-relay";

export default graphql`
  mutation setSidebarGroupsMutation(
    $subscription: String!
    $session: String
    $dataset: String!
    $stages: BSONArray!
    $sidebarGroups: [SidebarGroupInput!]!
  ) {
    setSidebarGroups(
      subscription: $subscription
      session: $session
      dataset: $dataset
      stages: $stages
      sidebarGroups: $sidebarGroups
    )
  }
`;
