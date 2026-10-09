import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReverbRoot, atom, useReverbValue } from "@fiftyone/reverb";
import { INT_FIELD } from "@fiftyone/utilities";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", async () => {
  const { atom } =
    await vi.importActual<typeof import("@fiftyone/reverb")>(
      "@fiftyone/reverb",
    );
  return { timeZone: atom({ key: "test_timeZone", default: "UTC" }) };
});

import RangeSlider, { type Range } from "./RangeSlider";

const boundsAtom = atom<Range>({ key: "test_bounds", default: [0, 10] });

let committed: Range = [null, null];
const Committed = ({ valueAtom }: { valueAtom: typeof boundsAtom }) => {
  committed = useReverbValue(valueAtom);
  return null;
};

const renderSlider = (value: Range) => {
  const valueAtom = atom<Range>({
    key: `test_value_${Math.random()}`,
    default: value,
  });
  render(
    <ReverbRoot>
      <RangeSlider
        valueAtom={valueAtom}
        boundsAtom={boundsAtom}
        color="#ff0000"
        fieldType={INT_FIELD}
      />
      <Committed valueAtom={valueAtom} />
    </ReverbRoot>,
  );
  const [low, high] = screen.getAllByRole("slider");
  return { low, high };
};

describe("RangeSlider", () => {
  afterEach(cleanup);

  it("commits only the knob that moved", () => {
    const { low } = renderSlider([null, 8]);
    fireEvent.keyDown(low, { key: "ArrowRight" });

    expect(committed).toEqual([1, 8]);
  });

  it("commits null, an open end, for a knob released on its bound", () => {
    const { low, high } = renderSlider([3, 8]);
    fireEvent.keyDown(high, { key: "End" });
    expect(committed).toEqual([3, null]);

    fireEvent.keyDown(low, { key: "Home" });
    expect(committed).toEqual([null, null]);
  });

  it("labels each knob with the field's formatted value", () => {
    renderSlider([2, null]);

    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });
});
