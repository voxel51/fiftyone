import { describe, expect, it } from "vitest";
import {
  hasModalFileRendererMatchers,
  matchesModalFileRenderer,
} from "./modal-file-renderer";

describe("hasModalFileRendererMatchers", () => {
  it("returns false for undefined or empty config", () => {
    expect(hasModalFileRendererMatchers(undefined)).toBe(false);
    expect(hasModalFileRendererMatchers({})).toBe(false);
    expect(hasModalFileRendererMatchers({ extensions: [] })).toBe(false);
  });

  it("returns false when arrays contain only whitespace", () => {
    expect(hasModalFileRendererMatchers({ extensions: ["  ", ""] })).toBe(
      false
    );
  });

  it("returns true when any matcher has values", () => {
    expect(hasModalFileRendererMatchers({ extensions: ["pdf"] })).toBe(true);
    expect(hasModalFileRendererMatchers({ mimeTypes: ["image/png"] })).toBe(
      true
    );
    expect(hasModalFileRendererMatchers({ mediaTypes: ["image"] })).toBe(true);
  });
});

describe("matchesModalFileRenderer", () => {
  const ctx = (ext?: string, mime?: string, media?: string) => ({
    extension: ext ?? null,
    mimeType: mime ?? null,
    mediaType: media ?? null,
  });

  it("returns false for undefined or empty renderer", () => {
    expect(matchesModalFileRenderer(undefined, ctx("pdf"))).toBe(false);
    expect(matchesModalFileRenderer({}, ctx("pdf"))).toBe(false);
  });

  it("matches by extension, case-insensitively, with or without dots", () => {
    expect(matchesModalFileRenderer({ extensions: [".PDF"] }, ctx("pdf"))).toBe(
      true
    );
    expect(matchesModalFileRenderer({ extensions: ["pdf"] }, ctx(".pdf"))).toBe(
      true
    );
  });

  it("matches by mimeType case-insensitively", () => {
    expect(
      matchesModalFileRenderer(
        { mimeTypes: ["APPLICATION/JSON"] },
        ctx(undefined, "application/json")
      )
    ).toBe(true);
  });

  it("matches by mediaType case-insensitively", () => {
    expect(
      matchesModalFileRenderer(
        { mediaTypes: ["UNKNOWN"] },
        ctx(undefined, undefined, "unknown")
      )
    ).toBe(true);
  });

  it("uses AND semantics across fields", () => {
    const renderer = { extensions: ["png"], mimeTypes: ["image/png"] };
    expect(matchesModalFileRenderer(renderer, ctx("png", "image/png"))).toBe(
      true
    );
    expect(matchesModalFileRenderer(renderer, ctx("png", "image/jpeg"))).toBe(
      false
    );
  });

  it("ignores unspecified fields", () => {
    expect(
      matchesModalFileRenderer(
        { extensions: ["pdf"] },
        ctx("pdf", "application/pdf", "unknown")
      )
    ).toBe(true);
  });

  it("returns false when context value is null for a specified matcher", () => {
    expect(matchesModalFileRenderer({ extensions: ["pdf"] }, ctx())).toBe(
      false
    );
  });
});
