import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
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
`);
