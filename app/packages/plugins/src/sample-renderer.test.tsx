import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createSampleRendererMediaContext,
  createSampleRendererRenderContext,
  getFileExtension,
  getMatchingSampleRenderer,
  getSampleRendererGridSlotComponent,
  getSampleRendererComponent,
  getSelectedMediaPath,
  hasMatchMediaMatchers,
  isSampleRendererGridEnabled,
  matchesMatchMedia,
  SAMPLE_RENDERER_GRID_SLOT,
  sortSampleRenderersByPriority,
  supportsSampleRenderer,
} from "./sample-renderer";

const dataset = { name: "dataset" } as any;
const schema = { filepath: { ftype: "StringField" } } as any;

const createSample = () =>
  ({
    sample: {
      filepath: "/tmp/default.bin",
      metadata: { mime_type: "application/pdf" },
      media_type: "unknown",
    },
    urls: [
      { field: "filepath", url: "/tmp/default.bin" },
      { field: "thumbnail_path", url: "/tmp/preview.PDF" },
    ],
  } as const);

const createRegistration = (
  name: string,
  sampleRendererOptions: {
    priority?: number;
    supports:
      | {
          extensions?: string[];
          mimeTypes?: string[];
          mediaTypes?: string[];
        }
      | ((ctx: any) => boolean);
    grid?: {
      enabled?: boolean;
      overrideComponent?: React.FunctionComponent<{ ctx: any }>;
      slots?: Partial<Record<string, React.FunctionComponent>>;
    };
  }
) => ({
  name,
  component: ({ ctx }: { ctx: any }) => <div>{ctx.media.url}</div>,
  sampleRendererOptions,
});

describe("sample renderer matcher utilities", () => {
  it("extracts file extensions from paths and URLs", () => {
    expect(getFileExtension("/tmp/Report.PDF")).toBe("pdf");
    expect(getFileExtension("https://example.com/report.PDF?x=1")).toBe("pdf");
    expect(getFileExtension("/tmp/noext")).toBeNull();
  });

  it("resolves the selected media path with filepath fallback", () => {
    const sample = createSample();

    expect(getSelectedMediaPath(sample, "thumbnail_path")).toBe(
      "/tmp/preview.PDF"
    );
    expect(getSelectedMediaPath(sample, "missing")).toBe("/tmp/default.bin");
  });

  it("builds a media context for non-native selected media", () => {
    const media = createSampleRendererMediaContext(
      createSample(),
      "thumbnail_path"
    );

    expect(media).toMatchObject({
      field: "thumbnail_path",
      path: "/tmp/preview.PDF",
      extension: "pdf",
      mimeType: "application/pdf",
      mediaType: "unknown",
      isNative: false,
    });
    expect(media.url).toContain(encodeURIComponent("/tmp/preview.PDF"));
  });

  it("builds a render context with the surface included", () => {
    const sample = createSample();
    const ctx = createSampleRendererRenderContext(
      sample,
      "thumbnail_path",
      dataset,
      schema,
      "modal"
    );

    expect(ctx.sample).toBe(sample);
    expect(ctx.dataset).toBe(dataset);
    expect(ctx.schema).toBe(schema);
    expect(ctx.surface).toBe("modal");
  });

  it("detects matcher presence only when a matcher field is populated", () => {
    expect(hasMatchMediaMatchers(undefined)).toBe(false);
    expect(hasMatchMediaMatchers({})).toBe(false);
    expect(hasMatchMediaMatchers({ extensions: ["  ", ""] })).toBe(false);
    expect(hasMatchMediaMatchers({ mimeTypes: ["application/pdf"] })).toBe(
      true
    );
  });

  it("matches extensions, mime types, and media types case-insensitively", () => {
    const media = createSampleRendererMediaContext(
      createSample(),
      "thumbnail_path"
    );

    expect(matchesMatchMedia({ extensions: [".pdf"] }, media)).toBe(true);
    expect(matchesMatchMedia({ mimeTypes: ["APPLICATION/PDF"] }, media)).toBe(
      true
    );
    expect(matchesMatchMedia({ mediaTypes: ["UNKNOWN"] }, media)).toBe(true);
  });

  it("requires all provided matcher fields to match", () => {
    const media = createSampleRendererMediaContext(
      createSample(),
      "thumbnail_path"
    );

    expect(
      matchesMatchMedia(
        {
          extensions: ["pdf"],
          mimeTypes: ["application/pdf"],
        },
        media
      )
    ).toBe(true);
    expect(
      matchesMatchMedia(
        {
          extensions: ["pdf"],
          mimeTypes: ["image/png"],
        },
        media
      )
    ).toBe(false);
  });
});

describe("sample renderer selection", () => {
  it("supports object matchers", () => {
    const ctx = createSampleRendererRenderContext(
      createSample(),
      "thumbnail_path",
      dataset,
      schema,
      "modal"
    );
    const registration = createRegistration("pdf", {
      supports: { extensions: ["pdf"] },
    });

    expect(supportsSampleRenderer(registration, ctx)).toBe(true);
  });

  it("supports predicate matchers", () => {
    const ctx = createSampleRendererRenderContext(
      createSample(),
      "thumbnail_path",
      dataset,
      schema,
      "modal"
    );
    const predicate = vi.fn(
      (matchCtx) => matchCtx.media.mimeType === "application/pdf"
    );
    const registration = createRegistration("pdf", {
      supports: predicate,
    });

    expect(supportsSampleRenderer(registration, ctx)).toBe(true);
    expect(predicate).toHaveBeenCalledWith(ctx);
  });

  it("sorts by priority descending and then name ascending", () => {
    const ctx = createSampleRendererRenderContext(
      createSample(),
      "thumbnail_path",
      dataset,
      schema,
      "modal"
    );
    const low = createRegistration("zeta", {
      priority: 1,
      supports: { extensions: ["pdf"] },
    });
    const tieA = createRegistration("alpha", {
      priority: 5,
      supports: { extensions: ["pdf"] },
    });
    const tieB = createRegistration("beta", {
      priority: 5,
      supports: { extensions: ["pdf"] },
    });

    expect([low, tieB, tieA].sort(sortSampleRenderersByPriority)).toEqual([
      tieA,
      tieB,
      low,
    ]);
    expect(getMatchingSampleRenderer([low, tieB, tieA], ctx)?.name).toBe(
      "alpha"
    );
  });

  it("does not match native media even when supports would otherwise match", () => {
    const sample = {
      sample: {
        filepath: "/tmp/image.png",
        metadata: { mime_type: "image/png" },
        media_type: "image",
      },
      urls: [{ field: "filepath", url: "/tmp/image.png" }],
    } as const;
    const ctx = createSampleRendererRenderContext(
      sample,
      "filepath",
      dataset,
      schema,
      "modal"
    );
    const registration = createRegistration("native-image", {
      supports: { mediaTypes: ["image"] },
    });

    expect(ctx.media.isNative).toBe(true);
    expect(getMatchingSampleRenderer([registration], ctx)).toBeNull();
  });

  it("keeps grid support disabled by default", () => {
    const ctx = createSampleRendererRenderContext(
      createSample(),
      "thumbnail_path",
      dataset,
      schema,
      "grid"
    );
    const registration = createRegistration("pdf", {
      supports: { extensions: ["pdf"] },
    });

    expect(isSampleRendererGridEnabled(registration)).toBe(false);
    expect(getMatchingSampleRenderer([registration], ctx)).toBeNull();
  });

  it("reuses the canonical component in grid when enabled without an override", () => {
    const canonical = ({ ctx }: { ctx: any }) => <div>{ctx.media.path}</div>;
    const registration = {
      ...createRegistration("pdf", {
        supports: { extensions: ["pdf"] },
        grid: { enabled: true },
      }),
      component: canonical,
    };

    expect(getSampleRendererComponent(registration, "grid", canonical)).toBe(
      canonical
    );
  });

  it("uses a grid override component when one is configured", () => {
    const canonical = ({ ctx }: { ctx: any }) => <div>{ctx.media.path}</div>;
    const override = ({ ctx }: { ctx: any }) => <span>{ctx.media.path}</span>;
    const registration = {
      ...createRegistration("pdf", {
        supports: { extensions: ["pdf"] },
        grid: { enabled: true, overrideComponent: override },
      }),
      component: canonical,
    };

    expect(getSampleRendererComponent(registration, "grid", canonical)).toBe(
      override
    );
  });

  it("returns a grid slot component only when grid rendering is enabled", () => {
    const SlotComponent = () => <div>header</div>;
    const enabledRegistration = createRegistration("enabled", {
      supports: { extensions: ["pdf"] },
      grid: {
        enabled: true,
        slots: {
          [SAMPLE_RENDERER_GRID_SLOT.HEADER_AFTER_RESOURCE_COUNT]:
            SlotComponent,
        },
      },
    });
    const disabledRegistration = createRegistration("disabled", {
      supports: { extensions: ["pdf"] },
      grid: {
        enabled: false,
        slots: {
          [SAMPLE_RENDERER_GRID_SLOT.HEADER_AFTER_RESOURCE_COUNT]:
            SlotComponent,
        },
      },
    });

    expect(
      getSampleRendererGridSlotComponent(
        enabledRegistration,
        SAMPLE_RENDERER_GRID_SLOT.HEADER_AFTER_RESOURCE_COUNT
      )
    ).toBe(SlotComponent);
    expect(
      getSampleRendererGridSlotComponent(
        disabledRegistration,
        SAMPLE_RENDERER_GRID_SLOT.HEADER_AFTER_RESOURCE_COUNT
      )
    ).toBeNull();
  });
});
