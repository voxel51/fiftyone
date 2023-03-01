import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
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
`);
