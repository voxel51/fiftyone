import { UserOrderFieldsOrder } from "@fiftyone/teams-state/src/Settings/__generated__/teamUsersListQuery.graphql";

export interface sortOptionType extends UserOrderFieldsOrder {
  displayName: string;
}

export const SORT_OPTIONS: sortOptionType[] = [
  {
    field: "name",
    direction: "ASC",
    displayName: "Name A-Z",
  },
  {
    field: "name",
    direction: "DESC",
    displayName: "Name Z-A",
  },
];
