/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SampleCount } from "./samples";

const count: { state: string; contents?: unknown } = {
  state: "loading",
  contents: new Promise(() => undefined),
};

vi.mock("@fiftyone/state", () => ({ count: () => "count" }));
vi.mock("@fiftyone/reverb", () => ({
  useReverbValueLoadable: () => count,
}));
vi.mock("@fiftyone/plugins", () => ({}));
vi.mock("@fiftyone/sidebar", () => ({}));
vi.mock("../components/Grid/Header", () => ({ default: () => null }));
vi.mock("../components/Modal/Sidebar/Annotate", () => ({}));
vi.mock("../components/SchemaLens/SchemaLensRow", () => ({
  default: () => null,
}));

afterEach(cleanup);

const pill = (container: HTMLElement) =>
  container.querySelector('[data-cy="samples-tab-count"]');

describe("SampleCount", () => {
  it("keeps the last count while a recount loads", () => {
    const { container, rerender } = render(<SampleCount />);
    expect(pill(container)).toBeNull();

    count.state = "hasValue";
    count.contents = 1200;
    rerender(<SampleCount />);
    expect(pill(container)?.textContent).toBe("1,200");

    count.state = "loading";
    count.contents = new Promise(() => undefined);
    rerender(<SampleCount />);
    expect(pill(container)?.textContent).toBe("1,200");
  });
});
