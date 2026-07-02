import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMcapResourceClient } from "./use-mcap-resource-client";

const resourceHarness = vi.hoisted(() => {
  const client = {
    dispose: vi.fn(),
  };
  const release = vi.fn();

  return {
    acquireSharedMcapResourceClient: vi.fn(() => ({ client, release })),
    client,
    release,
  };
});

vi.mock("../resource-client", () => ({
  acquireSharedMcapResourceClient:
    resourceHarness.acquireSharedMcapResourceClient,
}));

describe("useMcapResourceClient", () => {
  beforeEach(() => {
    resourceHarness.acquireSharedMcapResourceClient.mockClear();
    resourceHarness.release.mockClear();
  });

  it("acquires the shared client and releases it on unmount", () => {
    const { unmount } = render(<McapResourceClientHarness worker />);

    expect(
      resourceHarness.acquireSharedMcapResourceClient,
    ).toHaveBeenCalledWith({
      worker: true,
    });
    expect(resourceHarness.release).not.toHaveBeenCalled();

    unmount();

    // Release, not dispose: the shared client lingers so the next sample's
    // renderer reuses the warm worker fleet.
    expect(resourceHarness.release).toHaveBeenCalledTimes(1);
    expect(resourceHarness.client.dispose).not.toHaveBeenCalled();
  });
});

function McapResourceClientHarness({ worker }: { readonly worker: boolean }) {
  useMcapResourceClient({ worker });

  return null;
}
