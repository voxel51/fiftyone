import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { cloneDeep } from "lodash";
import { RecoilRoot } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", async () => {
  const { atom } = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    colorScheme: atom({
      key: "test_colorScheme",
      default: { colorPool: ["#009999"] },
    }),
    useOutsideClick: () => undefined,
  };
});
vi.mock("../state", async () => {
  const { atom } = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    activeColorPath: atom({ key: "test_activeColorPath", default: "tags" }),
  };
});
vi.mock("@fiftyone/looker/src/overlays/util", () => ({
  isValidColor: () => true,
}));
vi.mock("react-color", () => ({ ChromePicker: () => null }));
vi.mock("../../utils", () => ({ Button: () => null }));
vi.mock("../ShareStyledDiv", () => ({
  AddContainer: "div",
  ChromePickerWrapper: "div",
  ColorSquare: "div",
  DeleteButton: () => null,
  RowContainer: "div",
}));
vi.mock("../../Common/Input", () => ({
  default: ({
    id,
    value,
    setter,
  }: {
    id: string;
    value: string;
    setter: (value: string) => void;
  }) => (
    <input
      data-testid={id}
      value={value}
      onChange={(e) => setter(e.target.value)}
    />
  ),
}));

import ValueColorList from "./ValueColorList";

const VALUES = [{ value: "validation", color: "#009999" }];

const list = (values: typeof VALUES) => (
  <RecoilRoot>
    <ValueColorList
      initialValue={values}
      values={values}
      style={{}}
      onSyncUpdate={() => undefined}
      shouldShowAddButton
    />
  </RecoilRoot>
);

const color = () => (screen.getByTestId("color-0") as HTMLInputElement).value;

describe("ValueColorList", () => {
  afterEach(cleanup);

  it("keeps a typed edit when the session repeats the shown values", () => {
    const { rerender } = render(list(VALUES));
    fireEvent.change(screen.getByTestId("color-0"), {
      target: { value: "#9ACD32" },
    });

    rerender(list(cloneDeep(VALUES)));
    expect(color()).toBe("#9ACD32");

    rerender(list([{ value: "validation", color: "#ff0000" }]));
    expect(color()).toBe("#ff0000");
  });
});
