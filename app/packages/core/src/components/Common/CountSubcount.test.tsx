import { act, cleanup, render } from "@testing-library/react";
import type { SetterOrUpdater } from "recoil";
import { RecoilRoot, atom, useSetRecoilState } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@fiftyone/events", () => ({
  getEventBus: () => ({ dispatch }),
}));
vi.mock("@fiftyone/components", () => ({ LoadingDots: () => null }));
vi.mock("@fiftyone/state", () => ({
  AggregationQueryTimeout: class AggregationQueryTimeout {},
}));
vi.mock("../Common/TimedOut", () => ({ default: () => null }));

import { SuspenseEntryCounts } from "./CountSubcount";

const countAtom = atom({ key: "test_count", default: 5 });
const subcountAtom = atom({ key: "test_subcount", default: 5 });

let setSubcount: SetterOrUpdater<number>;
const Setter = () => {
  setSubcount = useSetRecoilState(subcountAtom);
  return null;
};

const counts = (label: string, slice = "") => (
  <RecoilRoot>
    <Setter />
    <SuspenseEntryCounts
      countAtom={countAtom}
      subcountAtom={subcountAtom}
      signal="grid-elements"
      label={label}
      slice={slice}
    />
  </RecoilRoot>
);

const shown = (count: number, subcount: number, label: string, slice = "") => [
  "e2e:components:entry-count-shown",
  { signal: "grid-elements", count, subcount, label, slice },
];

describe("SuspenseEntryCounts", () => {
  afterEach(() => {
    dispatch.mockClear();
    cleanup();
  });

  it("signals only when the shown counts, their label or slice change", () => {
    const { rerender } = render(counts("groups with slice"));
    expect(dispatch.mock.calls).toEqual([shown(5, 5, "groups with slice")]);

    rerender(counts("groups with slice"));
    expect(dispatch).toHaveBeenCalledTimes(1);

    rerender(counts("patches"));
    act(() => setSubcount(3));
    expect(dispatch.mock.calls.slice(1)).toEqual([
      shown(5, 5, "patches"),
      shown(5, 3, "patches"),
    ]);

    rerender(counts("patches", "right"));
    expect(dispatch.mock.calls.slice(3)).toEqual([
      shown(5, 3, "patches", "right"),
    ]);
  });
});
