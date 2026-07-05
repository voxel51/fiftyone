import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ByteClient } from "../../../query/bytes";
import { useMcapResourceClient } from "./use-mcap-resource-client";

const resourceHarness = vi.hoisted(() => {
  const client = {
    dispose: vi.fn(),
  };
  const privateClient = {
    dispose: vi.fn(),
  };
  const release = vi.fn();

  return {
    acquireSharedMcapResourceClient: vi.fn(() => ({ client, release })),
    client,
    createMcapResourceClient: vi.fn(() => privateClient),
    privateClient,
    release,
  };
});

vi.mock("../resource-client", () => ({
  acquireSharedMcapResourceClient:
    resourceHarness.acquireSharedMcapResourceClient,
  createMcapResourceClient: resourceHarness.createMcapResourceClient,
}));

describe("useMcapResourceClient", () => {
  beforeEach(() => {
    resourceHarness.acquireSharedMcapResourceClient.mockClear();
    resourceHarness.createMcapResourceClient.mockClear();
    resourceHarness.privateClient.dispose.mockClear();
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

  it("creates a private inline client for custom byte readers", () => {
    const byteClient = { readBytes: vi.fn() } as unknown as ByteClient;
    const { unmount } = render(
      <McapResourceClientHarness byteClient={byteClient} worker />,
    );

    expect(
      resourceHarness.acquireSharedMcapResourceClient,
    ).not.toHaveBeenCalled();
    expect(resourceHarness.createMcapResourceClient).toHaveBeenCalledWith({
      byteClient,
      worker: true,
    });

    unmount();

    expect(resourceHarness.privateClient.dispose).toHaveBeenCalledTimes(1);
    expect(resourceHarness.release).not.toHaveBeenCalled();
  });
});

function McapResourceClientHarness({
  byteClient,
  worker,
}: {
  readonly byteClient?: ByteClient;
  readonly worker: boolean;
}) {
  useMcapResourceClient({ byteClient, worker });

  return null;
}
