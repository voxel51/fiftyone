import { PluginComponentRegistration } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { describe, expect, it } from "vitest";
import {
  getFileExtension,
  getMatchingModalFileRendererPanel,
  getModalFileRendererContext,
  getSelectedModalMediaPath,
} from "./modal-file-renderer";

const createPanel = ({
  name,
  priority,
  surfaces = "modal",
  modalFileRenderer,
}: {
  name: string;
  priority?: number;
  surfaces?: "grid" | "modal" | "grid modal";
  modalFileRenderer?: {
    extensions?: string[];
    mimeTypes?: string[];
    mediaTypes?: string[];
    allowInAnnotateMode?: boolean;
  };
}) =>
  ({
    name,
    label: name,
    component: () => null,
    type: 2,
    activator: () => true,
    panelOptions: { priority, surfaces, modalFileRenderer },
  } as unknown as PluginComponentRegistration);

const createSample = (
  overrides: Partial<fos.ModalSample> = {}
): fos.ModalSample => {
  const base = {
    id: "sample-id",
    sample: {
      _id: "sample-id",
      id: "sample-id",
      filepath: "/tmp/default.bin",
      metadata: { width: 1, height: 1, mime_type: "application/octet-stream" },
      tags: [],
      _label_tags: [],
      _media_type: "unknown",
    },
    urls: [
      { field: "filepath", url: "/tmp/default.bin" },
      { field: "thumbnail_path", url: "/tmp/preview.pdf" },
    ],
  };
  return { ...base, ...overrides } as fos.ModalSample;
};

const matchCtx = (ext?: string, mime?: string, media?: string) => ({
  extension: ext ?? null,
  mimeType: mime ?? null,
  mediaType: media ?? null,
});

describe("getFileExtension", () => {
  it("returns null for falsy input", () => {
    expect(getFileExtension(null)).toBeNull();
    expect(getFileExtension("")).toBeNull();
  });

  it("extracts lowercase extension from paths and URLs", () => {
    expect(getFileExtension("/tmp/report.PDF")).toBe("pdf");
    expect(getFileExtension("https://example.com/report.PDF?foo=1")).toBe(
      "pdf"
    );
  });

  it("returns null when there is no extension", () => {
    expect(getFileExtension("/tmp/noext")).toBeNull();
    expect(getFileExtension("/tmp/file.")).toBeNull();
  });

  it("uses the last dot for multi-dot filenames", () => {
    expect(getFileExtension("/tmp/archive.tar.gz")).toBe("gz");
  });
});

describe("getSelectedModalMediaPath", () => {
  it("resolves the selected media field", () => {
    expect(getSelectedModalMediaPath(createSample(), "thumbnail_path")).toBe(
      "/tmp/preview.pdf"
    );
  });

  it("falls back to filepath when field is missing", () => {
    expect(getSelectedModalMediaPath(createSample(), "nonexistent")).toBe(
      "/tmp/default.bin"
    );
  });
});

describe("getModalFileRendererContext", () => {
  it("assembles context from sample, media field, dataset, and schema", () => {
    const sample = createSample({
      sample: {
        ...createSample().sample,
        metadata: { width: 1, height: 1, mime_type: "application/pdf" },
        media_type: "unknown",
      } as fos.ModalSample["sample"],
    });

    const ctx = getModalFileRendererContext(
      sample,
      "thumbnail_path",
      { name: "ds" } as fos.State.Dataset,
      { filepath: { ftype: "StringField" } }
    );

    expect(ctx.selectedMediaField).toBe("thumbnail_path");
    expect(ctx.selectedMediaPath).toBe("/tmp/preview.pdf");
    expect(ctx.extension).toBe("pdf");
    expect(ctx.mimeType).toBe("application/pdf");
    expect(ctx.mediaType).toBe("unknown");
    expect(ctx.selectedMediaUrl).toContain(
      encodeURIComponent("/tmp/preview.pdf")
    );
  });
});

describe("getMatchingModalFileRendererPanel", () => {
  it("returns null when nothing matches", () => {
    const panel = createPanel({
      name: "pdf",
      modalFileRenderer: { extensions: ["pdf"] },
    });
    expect(
      getMatchingModalFileRendererPanel([panel], matchCtx("png"))
    ).toBeNull();
  });

  it("excludes grid-only panels", () => {
    const panel = createPanel({
      name: "grid-only",
      surfaces: "grid",
      modalFileRenderer: { extensions: ["pdf"] },
    });
    expect(
      getMatchingModalFileRendererPanel([panel], matchCtx("pdf"))
    ).toBeNull();
  });

  it("includes grid modal panels", () => {
    const panel = createPanel({
      name: "dual",
      surfaces: "grid modal",
      modalFileRenderer: { extensions: ["pdf"] },
    });
    expect(
      getMatchingModalFileRendererPanel([panel], matchCtx("pdf"))?.name
    ).toBe("dual");
  });

  it("prefers higher priority, then alphabetical name", () => {
    const panels = [
      createPanel({
        name: "zzz",
        priority: 1,
        modalFileRenderer: { extensions: ["pdf"] },
      }),
      createPanel({
        name: "bbb",
        priority: 10,
        modalFileRenderer: { extensions: ["pdf"] },
      }),
      createPanel({
        name: "aaa",
        priority: 10,
        modalFileRenderer: { extensions: ["pdf"] },
      }),
    ];

    expect(
      getMatchingModalFileRendererPanel(panels, matchCtx("pdf"))?.name
    ).toBe("aaa");
  });

  it("blocks annotate mode by default, allows when opted in", () => {
    const blocked = createPanel({
      name: "blocked",
      modalFileRenderer: { extensions: ["pdf"] },
    });
    const allowed = createPanel({
      name: "allowed",
      modalFileRenderer: { extensions: ["pdf"], allowInAnnotateMode: true },
    });

    expect(
      getMatchingModalFileRendererPanel([blocked], matchCtx("pdf"), {
        isAnnotate: true,
      })
    ).toBeNull();

    expect(
      getMatchingModalFileRendererPanel([allowed], matchCtx("pdf"), {
        isAnnotate: true,
      })?.name
    ).toBe("allowed");
  });
});
