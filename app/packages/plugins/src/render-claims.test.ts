import { describe, expect, it } from "vitest";
import {
  RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE,
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
        modeExtensions: ["modal.annotate", "grid.native"] as any,
      })
    ).toEqual(["grid.native"]);
  });

  it("reports non-array modeExtensions", () => {
    expect(
      getUnsupportedRenderClaimModeExtensions({
        modeExtensions: "modal.annotate" as any,
      })
    ).toEqual(["<non-array>"]);
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
