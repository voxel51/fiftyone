/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SchemaLensSelector from "./SchemaLensSelector";

const values: Record<string, unknown> = {
  datasetName: "quickstart",
  canEditLabels: { enabled: true },
  canManageSchema: { enabled: true },
  taskSchemaGoverns: false,
  isPatchesView: false,
};

const lens = {
  dataset: "quickstart",
  docId: "doc",
  name: "Reviewed",
  excluded: [],
};

vi.mock("@fiftyone/state", () => ({
  datasetName: "datasetName",
  canEditLabels: "canEditLabels",
  canManageSchema: "canManageSchema",
  taskSchemaGoverns: "taskSchemaGoverns",
  isPatchesView: "isPatchesView",
  schemaLens: "schemaLens",
  useRestrictedDatasetBrowsing: () => false,
}));
vi.mock("@fiftyone/reverb", () => ({
  useReverbValue: (key: string) => values[key],
  useReverbState: () => [lens, vi.fn()],
}));
vi.mock("jotai", () => ({ useAtomValue: () => null }));
vi.mock("@fiftyone/operators", () => ({ useOperatorAvailability: () => true }));
vi.mock("@fiftyone/actions", () => ({
  ToolbarAction: ({ label }: { label: ReactNode }) => <button>{label}</button>,
}));
vi.mock("../Modal/Sidebar/Annotate/SchemaManager/hooks", () => ({
  useSchemaManagerModal: () => ({
    schemaManagerDisplayed: false,
    openSchemaManager: vi.fn(),
  }),
}));
vi.mock("../Modal/Sidebar/Annotate/state", () => ({ taskLabelSchemaDoc: {} }));
vi.mock("../Modal/Sidebar/Annotate/useCanManageSchema", () => ({
  default: () => false,
}));
const api = {
  listDocs: () => new Promise(() => undefined),
  getDoc: vi.fn(),
};
vi.mock("../Modal/Sidebar/Annotate/SchemaManager/useSchemaDocs", () => ({
  LIST_LABEL_SCHEMA_DOCS_OPERATOR: "list",
  useSchemaDocs: () => api,
}));

afterEach(cleanup);

describe("SchemaLensSelector", () => {
  it("shows an applied lens by name, without a spinner, while schemas list", () => {
    const { container } = render(<SchemaLensSelector />);

    expect(container.textContent).toBe("Reviewed");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
