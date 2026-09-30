import {
  GraphQLError,
  NetworkError,
  NotFoundError,
  OperatorError,
  PanelEventError,
} from "@fiftyone/utilities";

/** One labelled block of an error's detail, rendered as code. */
export interface AppErrorSection {
  readonly label: string;
  readonly content: string;
}

export interface AppErrorDescription {
  /** The error's name, with its message when it carries one. */
  readonly title: string;
  readonly sections: readonly AppErrorSection[];
  /** A missing route is a message, not a failure worth a stack trace. */
  readonly notFound: boolean;
}

const trim = (content: string): string => content.trim().replace(/\n+/g, "\n");

/**
 * Turns an error into what a display needs, so every surface that reports one
 * reads the same taxonomy rather than re-deriving it.
 */
export function describeAppError(raised: unknown): AppErrorDescription {
  // A component may throw anything, and the boundary hands it over as thrown
  const error = raised instanceof Error ? raised : new Error(String(raised));
  const title = error.message ? `${error.name}: ${error.message}` : error.name;

  if (error instanceof NotFoundError) {
    return { title, sections: [], notFound: true };
  }

  const sections: AppErrorSection[] = [];

  if (error instanceof GraphQLError) {
    for (const gql of error.errors) {
      const stack = gql?.extensions?.stack;
      const trace = Array.isArray(stack) ? stack.join("\n") : stack;
      sections.push({
        label: gql?.message ?? "",
        content: typeof trace === "string" ? trim(trace) : "",
      });
    }
  } else if (error instanceof NetworkError) {
    if (error.code)
      sections.push({ label: "Code", content: String(error.code) });
    if (error.route) sections.push({ label: "Route", content: error.route });
    if (error.payload) {
      sections.push({
        label: "Payload",
        content: JSON.stringify(error.payload, null, 2),
      });
    }
  } else if (error instanceof OperatorError) {
    if (error.message)
      sections.push({ label: "Message", content: error.message });
    if (error.operator) {
      sections.push({ label: "Operator", content: error.operator });
    }
    if (error instanceof PanelEventError) {
      sections.push({ label: "Event", content: String(error.event) });
    }
    if (error.stack) {
      sections.push({ label: "Trace", content: trim(error.stack) });
    }
  }

  // An operator error already carries its trace above
  if (error.stack && !(error instanceof OperatorError)) {
    sections.push({ label: "Trace", content: trim(error.stack) });
  }

  return { title, sections, notFound: false };
}
