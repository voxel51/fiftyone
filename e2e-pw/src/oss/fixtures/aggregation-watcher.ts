import type { Page } from "@playwright/test";

type GraphQLOp = {
  operationName?: string;
  variables?: { form?: { paths?: unknown } };
};

/**
 * Passively records every path requested via `aggregationsQuery`. Use it to
 * assert on what aggregations an interaction did (or did not) send to the
 * server — e.g. that client-only pseudo paths are never requested, that no
 * path is requested more times than expected, or that an interaction only
 * aggregates an allowlisted subset of the schema.
 *
 * Implemented with `page.on("request")`, which is a passive observer: no
 * routing, no request modification, no added latency, no races.
 */
export class AggregationWatcher {
  private paths: string[] = [];

  constructor(page: Page) {
    page.on("request", (req) => {
      if (!req.url().endsWith("/graphql")) return;

      let body: unknown;
      try {
        body = req.postDataJSON();
      } catch {
        return;
      }
      if (!body) return;

      const ops: GraphQLOp[] = Array.isArray(body)
        ? (body as GraphQLOp[])
        : [body as GraphQLOp];

      for (const op of ops) {
        if (op?.operationName !== "aggregationsQuery") continue;
        const p = op.variables?.form?.paths;
        if (Array.isArray(p)) {
          for (const entry of p) {
            if (typeof entry === "string") this.paths.push(entry);
          }
        }
      }
    });
  }

  /** Returns a snapshot of every `paths` entry seen so far across all
   * `aggregationsQuery` requests. Duplicates are preserved intentionally so
   * callers can reason about how many times a path was requested. */
  allPaths() {
    return [...this.paths];
  }

  reset() {
    this.paths = [];
  }
}
