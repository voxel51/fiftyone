// Duplicated from @fiftyone/similarity-search to avoid
// a cross-package dependency (core does not depend on similarity-search)
export const SEARCH_OPERATOR_URI = "@voxel51/panels/similarity_search";
export const PANEL_NAME = "similarity_search_panel";

// Query type values (mirrors QueryType enum in similarity-search)
export const QUERY_TYPE_IMAGE = "image" as const;
export const QUERY_TYPE_TEXT = "text" as const;

// Search scope values (mirrors SearchScope type in similarity-search)
export const SCOPE_VIEW = "view" as const;
export const SCOPE_DATASET = "dataset" as const;
