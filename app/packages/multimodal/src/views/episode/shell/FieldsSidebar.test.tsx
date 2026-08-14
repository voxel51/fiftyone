import {
  Experimental_CssVarsProvider as CssVarsProvider,
  experimental_extendTheme as extendMuiTheme,
} from "@mui/material";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `JSONViewer` (used for non-empty object/array fields) reads the color
// scheme via MUI's `useColorScheme`, which throws outside a
// `CssVarsProvider` — the real app supplies one at its root
// (`ThemeProvider`), but this unit test renders `FieldsSidebar` standalone.
const muiTestTheme = extendMuiTheme();
function renderFieldsSidebar(ui: ReactElement) {
  return render(<CssVarsProvider theme={muiTestTheme}>{ui}</CssVarsProvider>);
}

interface FakeField {
  path: string;
  ftype: string;
  description?: string;
  dbField?: string | null;
}

const { fakeFields, useActiveModalSample, useSampleFields, useTimeZone } =
  vi.hoisted(() => ({
    fakeFields: [] as FakeField[],
    useActiveModalSample: vi.fn(),
    useSampleFields: vi.fn(),
    useTimeZone: vi.fn(),
  }));

vi.mock("@fiftyone/state", () => ({
  useActiveModalSample,
  useSampleFields,
  useTimeZone,
}));

import FieldsSidebar from "./FieldsSidebar";

function setFields(fields: FakeField[]) {
  fakeFields.length = 0;
  fakeFields.push(...fields);
}

describe("FieldsSidebar", () => {
  beforeEach(() => {
    useSampleFields.mockImplementation(() => fakeFields);
    useTimeZone.mockReturnValue("UTC");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an empty state when the dataset has no sample fields", () => {
    setFields([]);
    useActiveModalSample.mockReturnValue({});

    renderFieldsSidebar(<FieldsSidebar />);

    expect(screen.getByTestId("episode-fields-empty")).toBeTruthy();
  });

  it("filters out private (underscore-prefixed) schema fields", () => {
    setFields([
      { path: "_media_type", ftype: "fiftyone.core.fields.StringField" },
      { path: "filepath", ftype: "fiftyone.core.fields.StringField" },
    ]);
    useActiveModalSample.mockReturnValue({ filepath: "/a/b.mcap" });

    renderFieldsSidebar(<FieldsSidebar />);

    const body = screen.getByTestId("episode-fields-body");
    expect(body.textContent).toContain("filepath");
    expect(body.textContent).not.toContain("_media_type");
  });

  it("renders a plain string field's actual value, not its schema type", () => {
    setFields([
      { path: "filepath", ftype: "fiftyone.core.fields.StringField" },
    ]);
    useActiveModalSample.mockReturnValue({
      filepath: "/data/scene-0001.mcap",
    });

    renderFieldsSidebar(<FieldsSidebar />);

    const body = screen.getByTestId("episode-fields-body");
    expect(body.textContent).toContain("/data/scene-0001.mcap");
    expect(body.textContent).not.toContain("StringField");
  });

  it("resolves `id` against the sample's actual `_id` key", () => {
    setFields([
      {
        path: "id",
        ftype: "fiftyone.core.fields.ObjectIdField",
        dbField: "_id",
      },
    ]);
    useActiveModalSample.mockReturnValue({ _id: "abc123" });

    renderFieldsSidebar(<FieldsSidebar />);

    expect(screen.getByTestId("episode-fields-body").textContent).toContain(
      "abc123",
    );
  });

  it("formats a DateTimeField's raw {_cls, datetime} wrapper into a readable date", () => {
    setFields([
      { path: "created_at", ftype: "fiftyone.core.fields.DateTimeField" },
    ]);
    useActiveModalSample.mockReturnValue({
      created_at: { _cls: "DateTime", datetime: 1_700_000_000_000 },
    });

    renderFieldsSidebar(<FieldsSidebar />);

    const value = screen.getByTestId("episode-fields-body").textContent ?? "";
    expect(value).not.toContain("_cls");
    expect(value).not.toContain("1700000000000");
    // formatDateTime renders year-month-day with "-" separators (en-ZA).
    expect(value).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("renders an em dash for a field with no value, instead of blank", () => {
    setFields([
      { path: "metadata", ftype: "fiftyone.core.fields.EmbeddedDocumentField" },
    ]);
    useActiveModalSample.mockReturnValue({});

    renderFieldsSidebar(<FieldsSidebar />);

    expect(screen.getByTestId("episode-fields-body").textContent).toContain(
      "—",
    );
  });

  it("renders a non-empty list field's value through the JSON tree viewer", () => {
    setFields([{ path: "tags", ftype: "fiftyone.core.fields.ListField" }]);
    useActiveModalSample.mockReturnValue({ tags: ["train", "front-cam"] });

    renderFieldsSidebar(<FieldsSidebar />);

    // `JsonViewer` renders each entry as separate key/value nodes rather
    // than one flat stringified block, so assert on the values individually.
    const body = screen.getByTestId("episode-fields-body");
    expect(body.textContent).toContain("train");
    expect(body.textContent).toContain("front-cam");
  });

  it("shows a muted placeholder for an empty list field's value", () => {
    setFields([{ path: "tags", ftype: "fiftyone.core.fields.ListField" }]);
    useActiveModalSample.mockReturnValue({ tags: [] });

    renderFieldsSidebar(<FieldsSidebar />);

    expect(screen.getByTestId("episode-fields-body").textContent).toContain(
      "None",
    );
  });

  it("shows a field's description when present", () => {
    setFields([
      {
        path: "media_type",
        ftype: "fiftyone.core.fields.StringField",
        description: "The type of media for the sample.",
      },
    ]);
    useActiveModalSample.mockReturnValue({ media_type: "multimodal" });

    renderFieldsSidebar(<FieldsSidebar />);

    expect(screen.getByTestId("episode-fields-body").textContent).toContain(
      "The type of media for the sample.",
    );
  });
});
