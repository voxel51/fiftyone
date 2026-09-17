/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { atom } from "./atom";
import { atomFamily } from "./family";
import {
  useResetReverbState,
  useReverbCallback,
  useReverbState,
  useReverbValue,
  useReverbValueLoadable,
  useSetReverbState,
} from "./hooks";
import { ReverbRoot } from "./root";
import { selector } from "./selector";

const count = atom({ key: "count", default: 3 });
const doubled = selector<number>({
  key: "doubled",
  get: ({ get }) => get(count) * 2,
});

// Auto-cleanup only registers when vitest globals are on, which depends on
// which config picked the file up.
afterEach(cleanup);

describe("hooks", () => {
  it("reads and writes through a root", async () => {
    const Component = () => {
      const [value, setValue] = useReverbState(count);

      return (
        <button type="button" onClick={() => setValue(value + 1)}>
          {value}
        </button>
      );
    };

    render(
      <ReverbRoot>
        <Component />
      </ReverbRoot>,
    );

    expect(screen.getByRole("button").textContent).toBe("3");
    await act(async () => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("4");
  });

  it("re-renders a derived reader when its source changes", async () => {
    const Component = () => {
      const set = useSetReverbState(count);

      return (
        <button type="button" onClick={() => set(10)}>
          {useReverbValue(doubled)}
        </button>
      );
    };

    render(
      <ReverbRoot>
        <Component />
      </ReverbRoot>,
    );

    expect(screen.getByRole("button").textContent).toBe("6");
    await act(async () => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("20");
  });

  it("resets to the default", async () => {
    const Component = () => {
      const set = useSetReverbState(count);
      const reset = useResetReverbState(count);

      return (
        <>
          <output>{useReverbValue(count)}</output>
          <button type="button" onClick={() => set(99)}>
            set
          </button>
          <button type="button" onClick={reset}>
            reset
          </button>
        </>
      );
    };

    render(
      <ReverbRoot>
        <Component />
      </ReverbRoot>,
    );

    await act(async () => screen.getByText("set").click());
    expect(screen.getByRole("status").textContent).toBe("99");
    await act(async () => screen.getByText("reset").click());
    expect(screen.getByRole("status").textContent).toBe("3");
  });

  it("initializes state from the root", () => {
    const Component = () => <output>{useReverbValue(count)}</output>;

    render(
      <ReverbRoot initializeState={({ set }) => set(count, 42)}>
        <Component />
      </ReverbRoot>,
    );

    expect(screen.getByRole("status").textContent).toBe("42");
  });

  it("renders a derived value once for a multi-write callback", async () => {
    const left = atom({ key: "left", default: 0 });
    const right = atom({ key: "right", default: 0 });
    const total = selector<number>({
      key: "sum",
      get: ({ get }) => get(left) + get(right),
    });
    const renders: number[] = [];

    const Component = () => {
      const value = useReverbValue(total);
      renders.push(value);

      const write = useReverbCallback(
        ({ set }) =>
          () => {
            set(left, 3);
            set(right, 4);
          },
        [],
      );

      return (
        <button type="button" onClick={write}>
          {value}
        </button>
      );
    };

    render(
      <ReverbRoot>
        <Component />
      </ReverbRoot>,
    );

    await act(async () => screen.getByRole("button").click());

    // React decides how many passes to run; what matters is that no pass
    // observes the 3 + 0 intermediate.
    expect(renders).not.toContain(3);
    expect(renders.at(-1)).toBe(7);
  });

  it("reads a pending value as loading, then as a value", async () => {
    let settle: (value: string) => void = () => undefined;
    const pending = new Promise<string>((resolve) => {
      settle = resolve;
    });
    const async = selector<string>({
      key: "async",
      get: () => pending as never,
    });

    const Component = () => {
      const result = useReverbValueLoadable(async);

      return (
        <output>{result.state === "loading" ? "…" : result.getValue()}</output>
      );
    };

    render(
      <ReverbRoot>
        <Component />
      </ReverbRoot>,
    );

    expect(screen.getByRole("status").textContent).toBe("…");
    await act(async () => {
      settle("ready");
      await pending;
    });
    expect(screen.getByRole("status").textContent).toBe("ready");
  });

  it("keeps one family member for an inline parameter across renders", async () => {
    const byPath = atomFamily<number, { path: string; modal: boolean }>({
      key: "renderKeyed",
      default: 0,
    });

    const Component = () => {
      const [, bump] = useState(0);
      const [value, setValue] = useReverbState(
        byPath({ path: "a", modal: false }),
      );

      return (
        <>
          <output>{value}</output>
          <button type="button" onClick={() => setValue(value + 1)}>
            inc
          </button>
          <button type="button" onClick={() => bump((n) => n + 1)}>
            rerender
          </button>
        </>
      );
    };

    render(
      <ReverbRoot>
        <Component />
      </ReverbRoot>,
    );

    await act(async () => screen.getByText("inc").click());
    await act(async () => screen.getByText("rerender").click());

    // A per-render member would read back 0 here.
    expect(screen.getByRole("status").textContent).toBe("1");
  });
});
