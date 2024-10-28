import { RecentViewsListFragment$dataT } from "./query-types";

export type RecentView = RecentViewsListFragment$dataT["userViews"][0];

export type MUIThemeModeType = "light" | "dark" | "system";
