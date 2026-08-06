import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeField {
  path: string;
  ftype: string;
  description?: string;
  dbField?: string | null;
}

const { fieldsSentinel, timeZoneSentinel, fakeFields, useActiveModalSample } =
  vi.hoisted(() => ({
    fieldsSentinel: Symbol("fields-selector"),
    timeZoneSentinel: Symbol("timezone-selector"),
    fakeFields: [] as FakeField[],
    useActiveModalSample: vi.fn(),
  }));

vi.mock("recoil", () => ({
  useRecoilValue: (selector: unknown) => {
    if (selector === timeZoneSentinel) {
      return "UTC";
    }
    // `fields({...})` is called with a fresh params object each render, so
    // match on the sentinel the mocked `fields` selector always returns.
    return fakeFields;
  },
}));

vi.mock("@fiftyone/state", () => ({
  fields: () => fieldsSentinel,
  State: { SPACE: { SAMPLE: "sample" } },
  timeZone: timeZoneSentinel,
  useActiveModalSample,
}));

import McapFieldsSidebar from "./McapFieldsSidebar";

function setFields(fields: FakeField[]) {
  fakeFields.length = 0;
  fakeFields.push(...fields);
}

describe("McapFieldsSidebar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an empty state when the dataset has no sample fields", () => {
    setFields([]);
    useActiveModalSample.mockReturnValue({});

    render(<McapFieldsSidebar />);

    expect(screen.getByTestId("mcap-fields-empty")).toBeTruthy();
  });

  it("filters out private (underscore-prefixed) schema fields", () => {
    setFields([
      { path: "_media_type", ftype: "fiftyone.core.fields.StringField" },
      { path: "filepath", ftype: "fiftyone.core.fields.StringField" },
    ]);
    useActiveModalSample.mockReturnValue({ filepath: "/a/b.mcap" });

    render(<McapFieldsSidebar />);

    const body = screen.getByTestId("mcap-fields-body");
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

    render(<McapFieldsSidebar />);

    const body = screen.getByTestId("mcap-fields-body");
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

    render(<McapFieldsSidebar />);

    expect(screen.getByTestId("mcap-fields-body").textContent).toContain(
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

    render(<McapFieldsSidebar />);

    const value = screen.getByTestId("mcap-fields-body").textContent ?? "";
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

    render(<McapFieldsSidebar />);

    expect(screen.getByTestId("mcap-fields-body").textContent).toContain("—");
  });

  it("JSON-renders a list field's value", () => {
    setFields([{ path: "tags", ftype: "fiftyone.core.fields.ListField" }]);
    useActiveModalSample.mockReturnValue({ tags: ["train", "front-cam"] });

    render(<McapFieldsSidebar />);

    expect(screen.getByTestId("mcap-fields-body").textContent).toContain(
      '["train","front-cam"]',
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

    render(<McapFieldsSidebar />);

    expect(screen.getByTestId("mcap-fields-body").textContent).toContain(
      "The type of media for the sample.",
    );
  });
});
