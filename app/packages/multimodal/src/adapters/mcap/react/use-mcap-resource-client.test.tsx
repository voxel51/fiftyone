import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMcapResourceClient } from "./use-mcap-resource-client";

const resourceHarness = vi.hoisted(() => {
  const client = {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readSynchronizedMessageBatch: vi.fn(),
    readSynchronizedMessages: vi.fn(),
    readTopics: vi.fn(),
    readTimelineRange: vi.fn(),
  };

  return {
    client,
    createMcapResourceClient: vi.fn(() => client),
  };
});

vi.mock("../resource-client", () => ({
  createMcapResourceClient: resourceHarness.createMcapResourceClient,
}));

describe("useMcapResourceClient", () => {
  beforeEach(() => {
    resourceHarness.client.dispose.mockClear();
    resourceHarness.createMcapResourceClient.mockClear();
  });

  it("passes the worker option through and disposes the client", () => {
    const { unmount } = render(<McapResourceClientHarness worker />);

    expect(resourceHarness.createMcapResourceClient).toHaveBeenCalledWith({
      worker: true,
    });

    unmount();

    expect(resourceHarness.client.dispose).toHaveBeenCalledTimes(1);
  });
});

function McapResourceClientHarness({ worker }: { readonly worker: boolean }) {
  useMcapResourceClient({ worker });

  return null;
}
