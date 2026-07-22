import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HealthNotice } from "../status/health";
import {
  SceneNoticesProvider,
  useSceneNotices,
  usePublishSceneNotices,
} from "./scene-notices-context";

afterEach(() => cleanup());

function notice(
  id: string,
  scope: HealthNotice["scope"] = "scene",
): HealthNotice {
  return { id, message: `message ${id}`, scope, severity: "info" };
}

function Publisher({
  notices,
  tileId,
}: {
  readonly notices: readonly HealthNotice[];
  readonly tileId: string;
}) {
  usePublishSceneNotices(tileId, notices);
  return null;
}

function Reader({
  probe,
}: {
  readonly probe: { current: readonly HealthNotice[] | null };
}) {
  probe.current = useSceneNotices();
  return null;
}

describe("episode-scene-notices-context", () => {
  it("unions published notices and dedupes shared conditions by id", () => {
    const probe: { current: readonly HealthNotice[] | null } = {
      current: null,
    };
    render(
      <SceneNoticesProvider>
        <Publisher
          notices={[notice("transform:missing"), notice("render:sampled")]}
          tileId="a"
        />
        <Publisher
          notices={[notice("transform:missing"), notice("camera:lost")]}
          tileId="b"
        />
        <Reader probe={probe} />
      </SceneNoticesProvider>,
    );

    expect(probe.current?.map((entry) => entry.id)).toEqual([
      "transform:missing",
      "render:sampled",
      "camera:lost",
    ]);
  });

  it("filters non-scene scopes out of the scene union", () => {
    const probe: { current: readonly HealthNotice[] | null } = {
      current: null,
    };
    render(
      <SceneNoticesProvider>
        <Publisher
          notices={[notice("stream:stale", "tile"), notice("placement:ok")]}
          tileId="a"
        />
        <Reader probe={probe} />
      </SceneNoticesProvider>,
    );

    expect(probe.current?.map((entry) => entry.id)).toEqual(["placement:ok"]);
  });

  it("returns an empty stable list outside a provider", () => {
    const probe: { current: readonly HealthNotice[] | null } = {
      current: null,
    };
    render(<Reader probe={probe} />);

    expect(probe.current).toEqual([]);
  });
});
