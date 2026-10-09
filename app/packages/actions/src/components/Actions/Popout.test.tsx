// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.hoisted(() => vi.fn());
vi.mock("@fiftyone/events", () => ({ getEventBus: () => ({ dispatch }) }));

import Popout from "./Popout";

afterEach(cleanup);

describe("Popout", () => {
  it("tells e2e it opened and closed, under its hook", () => {
    const { container, unmount } = render(
      <Popout testId="group-media-visibility-popout">body</Popout>,
    );

    expect(
      container.querySelector("[data-cy=group-media-visibility-popout]")
        ?.textContent,
    ).toBe("body");
    expect(dispatch).toHaveBeenLastCalledWith("e2e:actions:popout", {
      id: "group-media-visibility-popout",
      open: true,
    });

    unmount();
    expect(dispatch).toHaveBeenLastCalledWith("e2e:actions:popout", {
      id: "group-media-visibility-popout",
      open: false,
    });
  });
});
