import type { SampleRendererProps } from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMcapSourceDescriptor } from "./sample";

vi.mock("@fiftyone/state", () => ({
  getSampleSrc: vi.fn((filepath: string) => `/media?filepath=${filepath}`),
}));

describe("MCAP sample source descriptors", () => {
  beforeEach(() => {
    vi.mocked(getSampleSrc).mockClear();
  });

  it("uses sample metadata size as an initial hint", () => {
    const source = getMcapSourceDescriptor(
      createContext({
        filepath: "/tmp/source.mcap",
        metadata: {
          size_bytes: 128,
        },
      })
    );

    expect(source).toMatchObject({
      sizeBytes: "128",
      sourceId: "/tmp/source.mcap",
      url: "/media?filepath=/tmp/source.mcap",
    });
    expect(getSampleSrc).toHaveBeenCalledWith("/tmp/source.mcap");
  });

  it("leaves size unknown when sample metadata is absent", () => {
    const source = getMcapSourceDescriptor(
      createContext({
        filepath: "/tmp/source.mcap",
      })
    );

    expect(source).toMatchObject({
      sourceId: "/tmp/source.mcap",
      url: "/media?filepath=/tmp/source.mcap",
    });
    expect(source?.sizeBytes).toBeUndefined();
  });
});

function createContext(sample: unknown): SampleRendererProps["ctx"] {
  return {
    sample: {
      sample,
    },
  } as SampleRendererProps["ctx"];
}
