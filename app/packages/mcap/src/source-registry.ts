import type { FetchMultimodalWorkspaceParams } from "./types";

type BuiltinSourceRegistration = {
  sourceKind: string;
  extensions: string[];
};

const BUILTIN_SOURCES: BuiltinSourceRegistration[] = [
  {
    sourceKind: "mcap",
    extensions: ["mcap"],
  },
];

function normalizeExtension(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.startsWith(".")
    ? value.slice(1).toLowerCase()
    : value.toLowerCase();
}

/** Infers the built-in multimodal source kind from a file extension or path. */
export function inferBuiltinSourceKind(
  extension: string | null | undefined,
  path: string | null | undefined
) {
  const normalizedExtension =
    normalizeExtension(extension) ??
    normalizeExtension(path?.split(".").at(-1) ?? null);

  if (!normalizedExtension) {
    return null;
  }

  const registration = BUILTIN_SOURCES.find(({ extensions }) =>
    extensions.includes(normalizedExtension)
  );

  return registration?.sourceKind ?? null;
}

/** Builds multimodal workspace request params with inferred built-in source kind. */
export function withInferredSourceKind(
  params: FetchMultimodalWorkspaceParams,
  extension: string | null | undefined,
  path: string | null | undefined
): FetchMultimodalWorkspaceParams {
  const sourceKind = inferBuiltinSourceKind(extension, path);
  if (!sourceKind) {
    return params;
  }

  return {
    ...params,
    sourceKind,
  };
}
