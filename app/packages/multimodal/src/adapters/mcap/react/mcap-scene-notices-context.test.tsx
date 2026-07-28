import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { McapHealthNotice } from "./mcap-health";
import {
  McapSceneNoticesProvider,
  useMcapSceneNotices,
  usePublishMcapSceneNotices,
} from "./mcap-scene-notices-context";

afterEach(() => cleanup());

function notice(
  id: string,
  scope: McapHealthNotice["scope"] = "scene",
): McapHealthNotice {
  return { id, message: `message ${id}`, scope, severity: "info" };
}

function Publisher({
  notices,
  tileId,
}: {
  readonly notices: readonly McapHealthNotice[];
  readonly tileId: string;
}) {
  usePublishMcapSceneNotices(tileId, notices);
  return null;
}

function Reader({
  probe,
}: {
  readonly probe: { current: readonly McapHealthNotice[] | null };
}) {
  probe.current = useMcapSceneNotices();
  return null;
}

describe("mcap-scene-notices-context", () => {
  it("unions published notices and dedupes shared conditions by id", () => {
    const probe: { current: readonly McapHealthNotice[] | null } = {
      current: null,
    };
    render(
      <McapSceneNoticesProvider>
        <Publisher
          notices={[notice("transform:missing"), notice("render:sampled")]}
          tileId="a"
        />
        <Publisher
          notices={[notice("transform:missing"), notice("camera:lost")]}
          tileId="b"
        />
        <Reader probe={probe} />
      </McapSceneNoticesProvider>,
    );

    expect(probe.current?.map((entry) => entry.id)).toEqual([
      "transform:missing",
      "render:sampled",
      "camera:lost",
    ]);
  });

  it("filters non-scene scopes out of the scene union", () => {
    const probe: { current: readonly McapHealthNotice[] | null } = {
      current: null,
    };
    render(
      <McapSceneNoticesProvider>
        <Publisher
          notices={[notice("stream:stale", "tile"), notice("placement:ok")]}
          tileId="a"
        />
        <Reader probe={probe} />
      </McapSceneNoticesProvider>,
    );

    expect(probe.current?.map((entry) => entry.id)).toEqual(["placement:ok"]);
  });

  it("returns an empty stable list outside a provider", () => {
    const probe: { current: readonly McapHealthNotice[] | null } = {
      current: null,
    };
    render(<Reader probe={probe} />);

    expect(probe.current).toEqual([]);
  });
});
