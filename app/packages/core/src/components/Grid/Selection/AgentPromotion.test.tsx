import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import AgentPromotion from "./AgentPromotion";

afterEach(cleanup);

function open() {
  render(<AgentPromotion />);
  fireEvent.click(screen.getByRole("button", { name: "Voxel51 Agent" }));
  return screen.getByRole("dialog", { name: "Voxel51 Agent" });
}

const recording = (dialog: HTMLElement, title: string) =>
  within(dialog).getByLabelText(`${title} with Voxel51 Agent`);

it("opens the showcase instead of navigating away", () => {
  const dialog = open();
  expect(within(dialog).getByText("Only in Voxel51")).toBeTruthy();
  // "Not now" is the only dismiss button.
  expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
  const tabs = within(dialog).getAllByRole("tab");
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    "Data discoverySearch your dataset with natural language.",
    "Automated annotation QACatch label issues with automated quality checks.",
    "Data work automationUse natural language to automate repetitive data work.",
    "Model evaluationQuickly surface underperforming classes and failure patterns.",
    "Custom pluginsExtend Voxel51 Agent with custom capabilities.",
  ]);
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  expect(recording(dialog, "Data discovery").getAttribute("src")).toMatch(
    /\/voxel51-agent-assets\/data-discovery\.webm$/,
  );
  const learn = within(dialog).getByRole("link", { name: "Learn more" });
  expect(learn.getAttribute("target")).toBe("_blank");
  const link = new URL(learn.getAttribute("href") ?? "");
  expect(link.origin + link.pathname).toBe("https://voxel51.com/voxel51-agent");
  expect(link.searchParams.get("utm_source")).toBe("FiftyOneApp");
});

it("closes from Not now", () => {
  const dialog = open();
  fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));
  expect(
    screen
      .getByRole("button", { name: "Voxel51 Agent" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});

it("plays the chosen capability and moves on when a recording ends", () => {
  const dialog = open();
  fireEvent.click(
    within(dialog).getByRole("tab", { name: /Model evaluation/ }),
  );
  fireEvent.ended(recording(dialog, "Model evaluation"));
  expect(
    within(dialog)
      .getByRole("tab", { name: /Custom plugins/ })
      .getAttribute("aria-selected"),
  ).toBe("true");
  // The tour wraps around after the last capability.
  fireEvent.ended(recording(dialog, "Custom plugins"));
  expect(recording(dialog, "Data discovery")).toBeTruthy();
});

it("moves between capabilities with the arrow keys", () => {
  const dialog = open();
  const tabs = within(dialog).getAllByRole("tab");
  fireEvent.keyDown(tabs[0], { key: "ArrowUp" });
  expect(tabs[4].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs[4]);
  fireEvent.keyDown(tabs[4], { key: "Home" });
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
});

it("keeps the player's frame when a recording cannot load", () => {
  const dialog = open();
  const panel = within(dialog).getByRole("tabpanel");
  expect(within(panel).getByText("Loading video")).toBeTruthy();
  fireEvent.error(recording(dialog, "Data discovery"));
  expect(within(panel).getByText("Video not accessible")).toBeTruthy();
  expect(
    within(panel).queryByRole("button", { name: /^(Play|Pause)$/ }),
  ).toBeNull();
});

it("offers playback control once a recording loads", () => {
  const dialog = open();
  fireEvent.loadedData(recording(dialog, "Data discovery"));
  const panel = within(dialog).getByRole("tabpanel");
  expect(within(panel).queryByText("Loading video")).toBeNull();
  expect(
    within(panel).getByRole("button", { name: /^(Play|Pause)$/ }),
  ).toBeTruthy();
});
