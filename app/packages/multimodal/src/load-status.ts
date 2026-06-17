/**
 * Shared load-state union used by React hooks throughout the multimodal
 * package. Each hook re-exports a domain-specific alias (e.g.
 * `McapFrameTransformsStatus`, `TagsStatus`) so consumers keep stable,
 * readable names while the underlying definition stays in one place.
 */
export type LoadStatus = "idle" | "loading" | "ready" | "error";
