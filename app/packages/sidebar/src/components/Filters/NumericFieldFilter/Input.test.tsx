import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ReverbRoot } from "@fiftyone/reverb";
import { DATE_FIELD, DATE_TIME_FIELD, FLOAT_FIELD } from "@fiftyone/utilities";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", async () => {
  const { atom } =
    await vi.importActual<typeof import("@fiftyone/reverb")>(
      "@fiftyone/reverb",
    );
  return { timeZone: atom({ key: "test_timeZone", default: "UTC" }) };
});

import { Input, type InputType } from "./Input";

const renderInput = (
  ftype: InputType,
  bound: number | null,
  value: number | null,
) => {
  const onSubmit = vi.fn();
  render(
    <ReverbRoot>
      <Input
        bound={bound}
        color="#ff0000"
        ftype={ftype}
        onSubmit={onSubmit}
        placeholder="min"
        value={value}
      />
    </ReverbRoot>,
  );
  return { input: screen.getByLabelText<HTMLInputElement>("min"), onSubmit };
};

describe("Input", () => {
  afterEach(cleanup);

  it("shows the bound of an open end, and keeps it open when untouched", () => {
    const { input, onSubmit } = renderInput(FLOAT_FIELD, 0.5, null);
    expect(input.value).toBe("0.5");

    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("parses a typed datetime in the shown format", () => {
    const bound = Date.UTC(2024, 0, 1);
    const { input, onSubmit } = renderInput(DATE_TIME_FIELD, bound, null);
    expect(input.value).toBe("2024-01-01 00:00:00");

    fireEvent.change(input, { target: { value: "2024-01-02 03:04:05" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith(Date.UTC(2024, 0, 2, 3, 4, 5));
  });

  it("opens a set end when cleared, and restores text it can't parse", () => {
    const { input, onSubmit } = renderInput(FLOAT_FIELD, 0, 2);
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("2");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onSubmit).toHaveBeenCalledWith(null);
  });
  it("commits a day picked from the calendar", async () => {
    const { input, onSubmit } = renderInput(
      DATE_FIELD,
      Date.UTC(2024, 0, 1),
      null,
    );
    fireEvent.click(screen.getByLabelText("Calendar"));
    const day = await waitFor(() => {
      const found = document.querySelector(
        ".react-datepicker__day--002:not(.react-datepicker__day--outside-month)",
      );
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    fireEvent.click(day);

    expect(input.value).toBe("2024-01-02");
    expect(onSubmit).toHaveBeenCalledWith(Date.UTC(2024, 0, 2));
  });
});
