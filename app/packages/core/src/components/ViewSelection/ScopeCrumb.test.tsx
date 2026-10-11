import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const scope = vi.fn();
const cy = (id: string) => document.querySelector(`[data-cy="${id}"]`);
vi.mock("./useScope", () => ({ default: () => scope() }));

import ScopeCrumb from "./ScopeCrumb";

describe("ScopeCrumb", () => {
  afterEach(cleanup);

  it("names every sample and counts them", () => {
    scope.mockReturnValue({ name: null, total: 1234 });
    render(<ScopeCrumb />);

    expect(cy("header-scope")?.textContent).toContain("All samples");
    expect(cy("header-scope-count")?.textContent).toBe((1234).toLocaleString());
  });

  it("names the loaded saved query", () => {
    scope.mockReturnValue({ name: "Night scenes", total: 48 });
    render(<ScopeCrumb />);

    expect(cy("header-scope")?.textContent).toContain("Night scenes");
  });

  it("leaves the count out until the first one arrives", () => {
    scope.mockReturnValue({ name: null, total: null });
    render(<ScopeCrumb />);

    expect(cy("header-scope-count")).toBeNull();
  });
});
