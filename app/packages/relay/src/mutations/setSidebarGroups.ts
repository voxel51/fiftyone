import { graphql } from "react-relay";

export default graphql`
  mutation setSidebarGroupsMutation(
    $subscription: String!
    $dataset: String!
    $stages: BSONArray!
    $sidebarGroups: [SidebarGroupInput!]!
  ) {
    setSidebarGroups(
      subscription: $subscription
      dataset: $dataset
      stages: $stages
      sidebarGroups: $sidebarGroups
    )
  }
`;
