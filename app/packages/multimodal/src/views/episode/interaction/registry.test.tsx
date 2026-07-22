import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createEpisodeTileRegistry } from "./registry";

interface Probe {
  readonly entries: ReadonlyMap<string, string>;
  readonly primary: string | null;
}

afterEach(() => cleanup());

function harness(preferredTileId?: string | null) {
  const registry = createEpisodeTileRegistry<string>("Test");
  const probe: { current: Probe | null } = { current: null };
  const setters = new Map<string, (value: string) => void>();

  function Publisher({
    initial,
    tileId,
  }: {
    readonly initial: string;
    readonly tileId: string;
  }) {
    const [value, setValue] = useState(initial);
    setters.set(tileId, setValue);
    registry.useRegister(tileId, value);
    return null;
  }

  function Reader() {
    probe.current = {
      entries: registry.useEntries(),
      primary: registry.usePrimary(preferredTileId),
    };
    return null;
  }

  function publish(tileId: string, value: string) {
    act(() => setters.get(tileId)?.(value));
  }

  return { probe, publish, Publisher, Reader, registry };
}

describe("createEpisodeTileRegistry", () => {
  it("registers per tile and preserves registration order", () => {
    const { probe, publish, Publisher, Reader, registry } = harness();
    render(
      <registry.Provider>
        <Publisher initial="alpha" tileId="a" />
        <Publisher initial="beta" tileId="b" />
        <Reader />
      </registry.Provider>,
    );

    expect([...(probe.current?.entries.entries() ?? [])]).toEqual([
      ["a", "alpha"],
      ["b", "beta"],
    ]);
    expect(probe.current?.primary).toBe("alpha");

    publish("a", "alpha-2");
    expect(probe.current?.entries.get("a")).toBe("alpha-2");
    expect(probe.current?.primary).toBe("alpha-2");
  });

  it("prefers the requested tile and falls back to the first registered", () => {
    const { probe, Publisher, Reader, registry } = harness("b");
    render(
      <registry.Provider>
        <Publisher initial="alpha" tileId="a" />
        <Publisher initial="beta" tileId="b" />
        <Reader />
      </registry.Provider>,
    );

    expect(probe.current?.primary).toBe("beta");
  });

  it("unregisters when the publishing tile unmounts", () => {
    const { probe, Publisher, Reader, registry } = harness();

    function Host({ mounted }: { readonly mounted: boolean }) {
      return (
        <registry.Provider>
          {mounted ? <Publisher initial="alpha" tileId="a" /> : null}
          <Publisher initial="beta" tileId="b" />
          <Reader />
        </registry.Provider>
      );
    }

    const { rerender } = render(<Host mounted />);
    expect(probe.current?.primary).toBe("alpha");

    rerender(<Host mounted={false} />);

    expect(probe.current?.entries.has("a")).toBe(false);
    expect(probe.current?.primary).toBe("beta");
  });

  it("degrades to empty reads outside a provider", () => {
    const { probe, Reader } = harness();
    render(<Reader />);

    expect(probe.current?.entries.size).toBe(0);
    expect(probe.current?.primary).toBeNull();
  });
});
