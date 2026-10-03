import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  available: false,
  ensureSchemasLoaded: vi.fn(),
  registerContextManager: vi.fn(),
}));

vi.mock("@fiftyone/annotation", () => ({
  useRegisterAnnotationContextManager: mocks.registerContextManager,
}));

vi.mock("@fiftyone/operators", () => ({
  useOperatorAvailability: vi.fn(() => mocks.available),
}));

vi.mock("../url/useSchemaManagerUrl", () => ({
  useSchemaManagerUrl: vi.fn(),
}));

vi.mock("./Modal/Sidebar/Annotate/SchemaManager", () => ({
  default: () => React.createElement("div", null, "schema-manager"),
}));

vi.mock("./Modal/Sidebar/Annotate/SchemaManager/hooks", () => ({
  useSchemaManagerModal: vi.fn(() => ({ schemaManagerDisplayed: false })),
}));

vi.mock("./Modal/Sidebar/Annotate/SchemaManagementProvider", () => ({
  default: () => React.createElement("div", null, "schema-provider"),
}));

vi.mock("./Modal/Sidebar/Annotate/useAnnotationContextManager", () => ({
  useAnnotationContextManager: vi.fn(() => ({})),
}));

vi.mock("./Modal/Sidebar/Annotate/useCanManageSchema", () => ({
  default: vi.fn(() => true),
}));

vi.mock("./Modal/Sidebar/Annotate/useEnsureSchemasLoaded", () => ({
  useEnsureSchemasLoaded: mocks.ensureSchemasLoaded,
}));

import SchemaManagerOutlet from "./SchemaManagerOutlet";

describe("SchemaManagerOutlet operator readiness", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available = false;
  });

  it("waits for its operator without delaying context registration", () => {
    const { rerender } = render(<SchemaManagerOutlet />);

    expect(mocks.ensureSchemasLoaded).toHaveBeenCalledWith(false);
    expect(mocks.registerContextManager).toHaveBeenCalledTimes(1);

    mocks.available = true;
    rerender(<SchemaManagerOutlet />);

    expect(mocks.ensureSchemasLoaded).toHaveBeenCalledWith(true);
    expect(mocks.registerContextManager).toHaveBeenCalledTimes(2);
  });
});
