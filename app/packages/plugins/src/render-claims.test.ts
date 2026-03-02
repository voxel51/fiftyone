import { describe, expect, it } from "vitest";
import {
  RENDER_CLAIM_MODE_EXTENSION_GRID,
  RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE,
  getFileExtension,
  getMatchingRenderClaimsPanel,
  getRenderClaimsContext,
  getSelectedMediaPath,
  getUnsupportedRenderClaimModeExtensions,
  hasRenderClaimMatchers,
  hasRenderClaimModeExtension,
  matchesRenderClaims,
} from "./render-claims";

describe("hasRenderClaimMatchers", () => {
  it("returns false for undefined or empty config", () => {
    expect(hasRenderClaimMatchers(undefined)).toBe(false);
    expect(hasRenderClaimMatchers({})).toBe(false);
    expect(hasRenderClaimMatchers({ extensions: [] })).toBe(false);
  });

  it("returns false when arrays contain only whitespace", () => {
    expect(hasRenderClaimMatchers({ extensions: ["  ", ""] })).toBe(false);
  });

  it("returns true when any matcher has values", () => {
    expect(hasRenderClaimMatchers({ extensions: ["pdf"] })).toBe(true);
    expect(hasRenderClaimMatchers({ mimeTypes: ["image/png"] })).toBe(true);
    expect(hasRenderClaimMatchers({ mediaTypes: ["image"] })).toBe(true);
  });
});

describe("getUnsupportedRenderClaimModeExtensions", () => {
  it("returns empty when modeExtensions is absent", () => {
    expect(getUnsupportedRenderClaimModeExtensions({})).toEqual([]);
    expect(getUnsupportedRenderClaimModeExtensions(undefined)).toEqual([]);
  });

  it("reports unsupported values", () => {
    expect(
      getUnsupportedRenderClaimModeExtensions({
        modeExtensions: ["modal.annotate", "grid", "grid.native"] as any,
      })
    ).toEqual(["grid.native"]);
  });

  it("reports non-array modeExtensions", () => {
    expect(() =>
      getUnsupportedRenderClaimModeExtensions({
        modeExtensions: "modal.annotate" as any,
      })
    ).toThrow(TypeError);
  });
});

describe("hasRenderClaimModeExtension", () => {
  it("returns false by default", () => {
    expect(hasRenderClaimModeExtension(undefined, "modal.annotate")).toBe(
      false
    );
    expect(hasRenderClaimModeExtension({}, "modal.annotate")).toBe(false);
  });

  it("returns true for supported values", () => {
    expect(
      hasRenderClaimModeExtension(
        {
          modeExtensions: [RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE],
        },
        RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE
      )
    ).toBe(true);

    expect(
      hasRenderClaimModeExtension(
        {
          modeExtensions: [RENDER_CLAIM_MODE_EXTENSION_GRID],
        },
        RENDER_CLAIM_MODE_EXTENSION_GRID
      )
    ).toBe(true);
  });
});

describe("matchesRenderClaims", () => {
  const ctx = (ext?: string, mime?: string, media?: string) => ({
    extension: ext ?? null,
    mimeType: mime ?? null,
    mediaType: media ?? null,
  });

  it("returns false for undefined or empty claims", () => {
    expect(matchesRenderClaims(undefined, ctx("pdf"))).toBe(false);
    expect(matchesRenderClaims({}, ctx("pdf"))).toBe(false);
  });

  it("matches by extension, case-insensitively, with or without dots", () => {
    expect(matchesRenderClaims({ extensions: [".PDF"] }, ctx("pdf"))).toBe(
      true
    );
    expect(matchesRenderClaims({ extensions: ["pdf"] }, ctx(".pdf"))).toBe(
      true
    );
  });

  it("matches by mimeType case-insensitively", () => {
    expect(
      matchesRenderClaims(
        { mimeTypes: ["APPLICATION/JSON"] },
        ctx(undefined, "application/json")
      )
    ).toBe(true);
  });

  it("matches by mediaType case-insensitively", () => {
    expect(
      matchesRenderClaims(
        { mediaTypes: ["UNKNOWN"] },
        ctx(undefined, undefined, "unknown")
      )
    ).toBe(true);
  });

  it("uses AND semantics across fields", () => {
    const claims = { extensions: ["png"], mimeTypes: ["image/png"] };
    expect(matchesRenderClaims(claims, ctx("png", "image/png"))).toBe(true);
    expect(matchesRenderClaims(claims, ctx("png", "image/jpeg"))).toBe(false);
  });

  it("ignores unspecified fields", () => {
    expect(
      matchesRenderClaims(
        { extensions: ["pdf"] },
        ctx("pdf", "application/pdf", "unknown")
      )
    ).toBe(true);
  });

  it("returns false when context value is null for a specified matcher", () => {
    expect(matchesRenderClaims({ extensions: ["pdf"] }, ctx())).toBe(false);
  });
});

describe("shared render-claims utilities", () => {
  const createPanel = ({
    name,
    priority,
    surfaces,
    renderClaims,
  }: {
    name: string;
    priority?: number;
    surfaces?: "grid" | "modal" | "grid modal";
    renderClaims?: {
      extensions?: string[];
      mimeTypes?: string[];
      mediaTypes?: string[];
      modeExtensions?: string[];
    };
  }) => ({
    name,
    panelOptions: {
      priority,
      surfaces,
      renderClaims,
    },
  });

  const createSample = () =>
    ({
      sample: {
        filepath: "/tmp/default.bin",
        metadata: { mime_type: "application/pdf" },
        media_type: "unknown",
      },
      urls: [
        { field: "filepath", url: "/tmp/default.bin" },
        { field: "thumbnail_path", url: "/tmp/preview.pdf" },
      ],
    } as const);

  it("extracts file extension from paths and URLs", () => {
    expect(getFileExtension("/tmp/Report.PDF")).toBe("pdf");
    expect(getFileExtension("https://example.com/report.PDF?x=1")).toBe("pdf");
    expect(getFileExtension("/tmp/noext")).toBeNull();
  });

  it("resolves selected media path from urls with filepath fallback", () => {
    const sample = createSample();
    expect(getSelectedMediaPath(sample, "thumbnail_path")).toBe(
      "/tmp/preview.pdf"
    );
    expect(getSelectedMediaPath(sample, "missing")).toBe("/tmp/default.bin");
  });

  it("builds full render claims context", () => {
    const sample = createSample();
    const dataset = { name: "ds" } as any;
    const schema = { filepath: { ftype: "StringField" } } as any;
    const ctx = getRenderClaimsContext(
      sample,
      "thumbnail_path",
      dataset,
      schema
    );

    expect(ctx.sample).toBe(sample);
    expect(ctx.selectedMediaField).toBe("thumbnail_path");
    expect(ctx.selectedMediaPath).toBe("/tmp/preview.pdf");
    expect(ctx.selectedMediaUrl).toContain(
      encodeURIComponent("/tmp/preview.pdf")
    );
    expect(ctx.extension).toBe("pdf");
    expect(ctx.mimeType).toBe("application/pdf");
    expect(ctx.mediaType).toBe("unknown");
    expect(ctx.dataset).toBe(dataset);
    expect(ctx.schema).toBe(schema);
  });

  it("derives mimeType from selectedMediaPath when it differs from filepath", () => {
    const sample = {
      sample: {
        filepath: "/tmp/document.pdf",
        metadata: { mime_type: "application/pdf" },
        media_type: "unknown",
      },
      urls: [
        { field: "filepath", url: "/tmp/document.pdf" },
        { field: "thumbnail_path", url: "/tmp/preview.jpg" },
      ],
    } as const;
    const dataset = { name: "ds" } as any;
    const schema = { filepath: { ftype: "StringField" } } as any;

    const ctx = getRenderClaimsContext(
      sample,
      "thumbnail_path",
      dataset,
      schema
    );

    expect(ctx.selectedMediaPath).toBe("/tmp/preview.jpg");
    expect(ctx.mimeType).toBe("image/jpeg");
    expect(ctx.extension).toBe("jpg");
  });

  it("uses metadata mime_type when selectedMediaPath matches filepath", () => {
    const sample = {
      sample: {
        filepath: "/tmp/data.bin",
        metadata: { mime_type: "application/octet-stream" },
        media_type: "unknown",
      },
      urls: [{ field: "filepath", url: "/tmp/data.bin" }],
    } as const;
    const dataset = { name: "ds" } as any;
    const schema = { filepath: { ftype: "StringField" } } as any;

    const ctx = getRenderClaimsContext(sample, "filepath", dataset, schema);

    expect(ctx.selectedMediaPath).toBe("/tmp/data.bin");
    expect(ctx.mimeType).toBe("application/octet-stream");
  });

  it("selects matching panels by priority", () => {
    const ctx = {
      extension: "pdf",
      mimeType: "application/pdf",
      mediaType: "unknown",
    };
    const panels = [
      createPanel({
        name: "lower-priority",
        priority: 5,
        surfaces: "modal",
        renderClaims: { extensions: ["pdf"] },
      }),
      createPanel({
        name: "higher-priority",
        priority: 10,
        surfaces: "grid",
        renderClaims: { extensions: ["pdf"] },
      }),
    ];

    expect(
      getMatchingRenderClaimsPanel(panels as any, ctx, { surface: "modal" })
        ?.name
    ).toBe("higher-priority");
  });

  it("requires grid mode extension for grid claims", () => {
    const ctx = {
      extension: "pdf",
      mimeType: "application/pdf",
      mediaType: "unknown",
    };
    const noGridExtension = createPanel({
      name: "no-grid-extension",
      surfaces: "grid",
      renderClaims: { extensions: ["pdf"] },
    });
    const withGridExtension = createPanel({
      name: "with-grid-extension",
      surfaces: "modal",
      renderClaims: {
        extensions: ["pdf"],
        modeExtensions: [RENDER_CLAIM_MODE_EXTENSION_GRID],
      },
    });

    expect(
      getMatchingRenderClaimsPanel([noGridExtension] as any, ctx, {
        surface: "grid",
      })
    ).toBeNull();

    expect(
      getMatchingRenderClaimsPanel([withGridExtension] as any, ctx, {
        surface: "grid",
      })?.name
    ).toBe("with-grid-extension");
  });

  it("matches modal claims without grid mode extension", () => {
    const ctx = {
      extension: "pdf",
      mimeType: "application/pdf",
      mediaType: "unknown",
    };
    const panel = createPanel({
      name: "modal-works-without-grid-extension",
      surfaces: "grid",
      renderClaims: { extensions: ["pdf"] },
    });

    expect(
      getMatchingRenderClaimsPanel([panel] as any, ctx, {
        surface: "modal",
      })?.name
    ).toBe("modal-works-without-grid-extension");
  });

  it("enforces modal annotate mode extension", () => {
    const ctx = {
      extension: "pdf",
      mimeType: "application/pdf",
      mediaType: "unknown",
    };
    const denied = createPanel({
      name: "denied",
      surfaces: "modal",
      renderClaims: { extensions: ["pdf"] },
    });
    const allowed = createPanel({
      name: "allowed",
      surfaces: "modal",
      renderClaims: {
        extensions: ["pdf"],
        modeExtensions: [RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE],
      },
    });

    expect(
      getMatchingRenderClaimsPanel([denied] as any, ctx, {
        surface: "modal",
        isAnnotate: true,
      })
    ).toBeNull();

    expect(
      getMatchingRenderClaimsPanel([allowed] as any, ctx, {
        surface: "modal",
        isAnnotate: true,
      })?.name
    ).toBe("allowed");
  });
});
