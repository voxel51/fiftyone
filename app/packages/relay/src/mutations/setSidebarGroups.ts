import { graphql } from "react-relay";

export default graphql`
  mutation setSidebarGroupsMutation(
    $dataset: String!
    $stages: BSONArray!
    $sidebarGroups: [SidebarGroupInput!]!
  ) {
    setSidebarGroups(
      dataset: $dataset
      stages: $stages
      sidebarGroups: $sidebarGroups
    )
  }
`;
