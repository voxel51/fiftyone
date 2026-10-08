import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { RecoilRoot } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SchemaConfigType } from "../../utils";
import PrimitiveFieldContent from "./PrimitiveFieldContent";

vi.mock("../../../Edit/PrimitiveRenderer", () => ({ default: () => null }));

const min = () =>
  screen.getByPlaceholderText("Minimum value") as HTMLInputElement;
const max = () =>
  screen.getByPlaceholderText("Maximum value") as HTMLInputElement;

const SLIDER: SchemaConfigType = { type: "float", component: "slider" };

/** Holds the config like the field editor does. */
const Editor = ({ initial }: { initial: SchemaConfigType }) => {
  const [config, setConfig] = useState(initial);
  return (
    <RecoilRoot>
      <PrimitiveFieldContent
        field="score"
        fieldType="Float"
        config={config}
        onConfigChange={setConfig}
      />
      <button
        onClick={() => setConfig({ ...SLIDER, range: [0.2548828125, 1] })}
      >
        scan
      </button>
      <output data-testid="config">{JSON.stringify(config)}</output>
    </RecoilRoot>
  );
};

describe("PrimitiveFieldContent range", () => {
  afterEach(cleanup);

  it("fills min and max when a scan sets the range", () => {
    render(<Editor initial={SLIDER} />);
    expect(min().value).toBe("");
    expect(max().value).toBe("");

    fireEvent.click(screen.getByText("scan"));

    expect(min().value).toBe("0.2548828125");
    expect(max().value).toBe("1");
  });

  it("keeps a value as typed rather than re-reading it from the config", () => {
    render(<Editor initial={{ ...SLIDER, range: [0, 1] }} />);

    // Re-seeding the inputs from the config would turn this into "0.5"
    fireEvent.change(min(), { target: { value: "0.50" } });

    expect(min().value).toBe("0.50");
    expect(screen.getByTestId("config").textContent).toContain(
      '"range":[0.5,1]',
    );
  });

  it("keeps the other input when one is cleared", () => {
    render(<Editor initial={{ ...SLIDER, range: [0, 1] }} />);

    fireEvent.change(min(), { target: { value: "" } });

    expect(min().value).toBe("");
    expect(max().value).toBe("1");
    expect(screen.getByTestId("config").textContent).not.toContain("range");
  });
});
