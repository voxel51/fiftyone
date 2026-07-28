import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PluginActivator,
  PluginComponentType,
  registerComponent,
  unregisterComponent,
  useActivePlugins,
  usePluginComponent,
} from "./registry";

const NullComponent = () => null;

const registered: string[] = [];

const register = (name: string, activator?: PluginActivator) => {
  registerComponent<PluginComponentType.Component>({
    name,
    label: name,
    component: NullComponent,
    type: PluginComponentType.Component,
    activator,
  });
  registered.push(name);
};

afterEach(() => {
  // Unmount all mounted hooks first — otherwise their active subscriptions
  // see the unregister-loop below and call activators from this test
  // against state belonging to a prior test.
  cleanup();
  while (registered.length) {
    const name = registered.pop();
    if (name) unregisterComponent(name);
  }
});

describe("useActivePlugins: required ctx (type contract)", () => {
  it("rejects callers that omit ctx at the type level", () => {
    // If either of these starts type-checking, the contract has regressed.
    // @ts-expect-error — ctx is required
    () => useActivePlugins(PluginComponentType.Component);
    // @ts-expect-error — ctx is required
    () => usePluginComponent("Foo");
  });
});

describe("useActivePlugins: runtime behavior", () => {
  it("returns plugins whose activator returns true for the supplied ctx", () => {
    type Ctx = { dataset?: { mediaType?: string } };
    register("always-active", () => true);
    register("video-only", (ctx: Ctx) => ctx.dataset?.mediaType === "video");
    register("image-only", (ctx: Ctx) => ctx.dataset?.mediaType === "image");

    const { result } = renderHook(() =>
      useActivePlugins(PluginComponentType.Component, {
        dataset: { mediaType: "video" },
      }),
    );

    const names = result.current.map((p) => p.name).sort();
    expect(names).toEqual(["always-active", "video-only"]);
  });

  it("passes the caller-supplied ctx straight through to each activator", () => {
    const activator = vi.fn((_ctx: Record<string, unknown>) => true);
    register("probe", activator);

    const ctx = { foo: "bar", nested: { value: 42 } };
    renderHook(() => useActivePlugins(PluginComponentType.Component, ctx));

    expect(activator).toHaveBeenCalled();
    // Reference equality: no wrapping or merging with an implicit default.
    expect(activator.mock.calls[0][0]).toBe(ctx);
  });

  it("re-filters when ctx changes", () => {
    type Ctx = { mediaType?: string };
    register("video-only", (ctx: Ctx) => ctx.mediaType === "video");
    register("image-only", (ctx: Ctx) => ctx.mediaType === "image");

    const { result, rerender } = renderHook(
      ({ ctx }: { ctx: Record<string, unknown> }) =>
        useActivePlugins(PluginComponentType.Component, ctx),
      {
        initialProps: {
          ctx: { mediaType: "video" } as Record<string, unknown>,
        },
      },
    );

    expect(result.current.map((p) => p.name)).toEqual(["video-only"]);

    rerender({ ctx: { mediaType: "image" } });
    expect(result.current.map((p) => p.name)).toEqual(["image-only"]);
  });

  it("reflects plugins registered after mount", () => {
    const { result } = renderHook(() =>
      useActivePlugins(PluginComponentType.Component, {}),
    );

    expect(result.current).toEqual([]);

    act(() => {
      register("late-registered", () => true);
    });

    expect(result.current.map((p) => p.name)).toEqual(["late-registered"]);
  });

  it("does not crash when rendered without any Recoil / Writer context", () => {
    // No RecoilRoot wrapping the renderHook — proves the hook touches no
    // recoil state. If this starts failing, a hidden subscription has crept
    // back in.
    register("probe", () => true);
    expect(() =>
      renderHook(() => useActivePlugins(PluginComponentType.Component, {})),
    ).not.toThrow();
  });
});

describe("usePluginComponent: runtime behavior", () => {
  it("returns the named component when its activator passes ctx, else undefined", () => {
    register("Target", (ctx: { allow?: boolean }) => ctx.allow === true);
    register("Other", () => true);

    const { result, rerender } = renderHook(
      ({ allow }: { allow: boolean }) =>
        usePluginComponent("Target", { allow }),
      { initialProps: { allow: true } },
    );
    expect(result.current?.name).toBe("Target");

    rerender({ allow: false });
    expect(result.current).toBeUndefined();
  });
});
