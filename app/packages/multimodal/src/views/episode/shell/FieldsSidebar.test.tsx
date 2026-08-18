import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function renderFieldsSidebar(ui: ReactElement) {
  return render(ui);
}

interface FakeField {
  path: string;
  ftype: string;
  description?: string;
  dbField?: string | null;
}

const {
  fakeFields,
  fieldVisibilityStageValue,
  useActiveModalSample,
  useSampleFields,
  useTimeZone,
} = vi.hoisted(() => ({
  fakeFields: [] as FakeField[],
  fieldVisibilityStageValue: { current: null as unknown },
  useActiveModalSample: vi.fn(),
  useSampleFields: vi.fn(),
  useTimeZone: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  fieldVisibilityStage: "fieldVisibilityStage",
  useActiveModalSample,
  useSampleFields,
  useTimeZone,
}));

vi.mock("recoil", () => ({
  useRecoilValue: () => fieldVisibilityStageValue.current,
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
    fieldVisibilityStageValue.current = null;
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

  it("filters out multimodal projection grain fields independently of field visibility", () => {
    setFields([
      { path: "events", ftype: "fiftyone.core.fields.EmbeddedDocumentField" },
      {
        path: "events.drive_events.event",
        ftype: "fiftyone.core.fields.StringField",
      },
      {
        path: "labels.camera_labels.label",
        ftype: "fiftyone.core.fields.StringField",
      },
      {
        path: "summaries.episode_summary.duration",
        ftype: "fiftyone.core.fields.FloatField",
      },
      {
        path: "signals.imu.angular_velocity",
        ftype: "fiftyone.core.fields.FloatField",
      },
      {
        path: "metadata",
        ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      },
      {
        path: "metadata.labels",
        ftype: "fiftyone.core.fields.StringField",
      },
      {
        path: "event_count",
        ftype: "fiftyone.core.fields.IntField",
      },
    ]);
    useActiveModalSample.mockReturnValue({
      event_count: 4,
      metadata: { labels: "release" },
    });

    renderFieldsSidebar(<FieldsSidebar />);
    fireEvent.click(screen.getByText("metadata"));

    const body = screen.getByTestId("episode-fields-body");
    expect(body.textContent).not.toContain("events");
    expect(body.textContent).not.toContain("camera_labels");
    expect(body.textContent).not.toContain("episode_summary");
    expect(body.textContent).not.toContain("angular_velocity");
    expect(body.textContent).toContain("labels");
    expect(body.textContent).toContain("release");
    expect(body.textContent).toContain("event_count");
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

  it("renders a non-empty primitive list field inline", () => {
    setFields([{ path: "tags", ftype: "fiftyone.core.fields.ListField" }]);
    useActiveModalSample.mockReturnValue({ tags: ["train", "front-cam"] });

    renderFieldsSidebar(<FieldsSidebar />);

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

  it("filters out fields hidden by the field visibility stage", () => {
    setFields([
      { path: "filepath", ftype: "fiftyone.core.fields.StringField" },
      { path: "secret_field", ftype: "fiftyone.core.fields.StringField" },
    ]);
    useActiveModalSample.mockReturnValue({
      filepath: "/a/b.mcap",
      secret_field: "hidden",
    });
    fieldVisibilityStageValue.current = {
      kwargs: { field_names: ["secret_field"] },
    };

    render(<FieldsSidebar />);

    const body = screen.getByTestId("episode-fields-body");
    expect(body.textContent).toContain("filepath");
    expect(body.textContent).not.toContain("secret_field");
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

  it("shows metadata once as a collapsible field group", () => {
    setFields([
      {
        path: "metadata",
        ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      },
      {
        path: "metadata.mime_type",
        ftype: "fiftyone.core.fields.StringField",
      },
    ]);
    useActiveModalSample.mockReturnValue({
      metadata: {
        _cls: "MultimodalMetadata",
        mime_type: "application/octet-stream",
        source_format: "mcap",
      },
    });

    renderFieldsSidebar(<FieldsSidebar />);

    const metadata = screen.getByText("metadata").closest("details");
    expect(metadata?.hasAttribute("open")).toBe(false);

    fireEvent.click(screen.getByText("metadata"));

    expect(metadata?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("mime_type")).toBeTruthy();
    expect(screen.getByText("source_format")).toBeTruthy();
    expect(screen.queryByText("_cls")).toBeNull();
  });

  it("searches nested field paths and primitive values", () => {
    setFields([
      { path: "filepath", ftype: "fiftyone.core.fields.StringField" },
      {
        path: "metadata",
        ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      },
      {
        path: "metadata.mime_type",
        ftype: "fiftyone.core.fields.StringField",
      },
      { path: "scene_name", ftype: "fiftyone.core.fields.StringField" },
      { path: "tags", ftype: "fiftyone.core.fields.ListField" },
    ]);
    useActiveModalSample.mockReturnValue({
      filepath: "/a/b.mcap",
      metadata: { mime_type: "application/octet-stream" },
      scene_name: "Warehouse A",
      tags: ["train", "front-cam"],
    });

    renderFieldsSidebar(<FieldsSidebar />);
    fireEvent.change(screen.getByLabelText("Search fields"), {
      target: { value: "mime" },
    });

    expect(screen.getByText("metadata")).toBeTruthy();
    expect(screen.getByText("mime_type")).toBeTruthy();
    expect(screen.queryByText("filepath")).toBeNull();
    expect(screen.queryByText("scene_name")).toBeNull();
    expect(screen.queryByText("tags")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search fields"), {
      target: { value: "warehouse" },
    });
    expect(screen.getByText("scene_name")).toBeTruthy();
    expect(screen.queryByText("metadata")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search fields"), {
      target: { value: "train" },
    });
    expect(screen.getByText("tags")).toBeTruthy();
    expect(screen.queryByText("scene_name")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search fields"), {
      target: { value: "nothing" },
    });
    expect(screen.getByText('No fields match "nothing"')).toBeTruthy();
  });
});
