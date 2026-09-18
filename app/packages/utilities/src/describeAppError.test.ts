import { describe, expect, it } from "vitest";
import { describeAppError } from "./describeAppError";
import {
  GraphQLError,
  NetworkError,
  NotFoundError,
  OperatorError,
  PanelEventError,
} from "./errors";

describe("describeAppError", () => {
  it("reports a missing route as a message, with nothing to expand", () => {
    const described = describeAppError(new NotFoundError({ path: "/nope" }));

    expect(described.notFound).toBe(true);
    expect(described.sections).toHaveLength(0);
    expect(described.title).toContain("404: /nope not found");
  });

  it("gives each GraphQL error its message and server trace", () => {
    const described = describeAppError(
      new GraphQLError({
        errors: [
          {
            message: "field missing",
            extensions: { stack: ["line one", "line two"] },
            paths: [],
          },
        ],
      }),
    );

    // The error's own JS stack follows the server's trace, as it does for
    // every error that is not an operator's
    expect(described.sections.map((s) => s.label)).toEqual([
      "field missing",
      "Trace",
    ]);
    expect(described.sections[0].content).toBe("line one\nline two");
  });

  it("reports a network error's code, route and payload", () => {
    const error = new NetworkError(
      {
        code: 500,
        route: "/aggregate",
        statusText: "Server Error",
        payload: { dataset: "quickstart" },
        bodyResponse: "",
        requestHeaders: {},
        responseHeaders: new Headers(),
      },
      "boom",
    );

    expect(describeAppError(error).sections.map((s) => s.label)).toEqual([
      "Code",
      "Route",
      "Payload",
      "Trace",
    ]);
  });

  it("keeps an operator's trace out of the generic trace section", () => {
    const described = describeAppError(
      new OperatorError("boom", "at operator", "@voxel51/io/import_samples"),
    );

    expect(described.sections.map((s) => s.label)).toEqual([
      "Message",
      "Operator",
      "Trace",
    ]);
  });

  it("names the event a panel error carries", () => {
    const described = describeAppError(
      new PanelEventError("boom", "at panel", "@voxel51/panel", "on_click"),
    );

    expect(described.sections.map((s) => s.label)).toContain("Event");
  });

  it("appends the trace of an ordinary error", () => {
    const error = new Error("plain");
    error.stack = "at one\n\n\nat two";

    const described = describeAppError(error);

    expect(described.title).toBe("Error: plain");
    expect(described.sections).toEqual([
      { label: "Trace", content: "at one\nat two" },
    ]);
  });
});
