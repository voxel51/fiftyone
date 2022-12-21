import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";

import RecoilApp from "../src/App";

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

describe("App", () => {
  it("renders samples tab without close button", () => {
    render(<RecoilApp />);

    const closeIcon = screen.getByTestId("CloseIcon");
    const samplesTab = screen.getByRole("button", { name: /Samples/i });

    expect(samplesTab).toBeInTheDocument();
    expect(samplesTab).not.toContainElement(closeIcon);
  });

  it("renders histograms tab with close button", () => {
    render(<RecoilApp />);

    const closeIcon = screen.getByTestId("CloseIcon");
    const histogramsTab = screen.getByRole("button", { name: /Histograms/i });

    expect(histogramsTab).toBeInTheDocument();
    expect(histogramsTab).toContainElement(closeIcon);
  });

  it("renders only non-active panels in popout when add button is clicked", async () => {
    render(<RecoilApp />);

    const addIcons = screen.getAllByTestId("AddIcon");
    const firstAddIcon = addIcons[0];
    expect(screen.queryByTestId("addPanelPopup")).toBeNull();
    await userEvent.click(firstAddIcon);
    const panelPopup = screen.queryByTestId("addPanelPopup") as HTMLElement;
    expect(panelPopup).not.toBeNull();
    expect(within(panelPopup).queryByText("Samples")).toBeNull();
    expect(within(panelPopup).queryByText("Histograms")).toBeNull();
    expect(within(panelPopup).queryByText("Embeddings")).not.toBeNull();
    expect(within(panelPopup).queryByText("Form")).not.toBeNull();
    expect(within(panelPopup).queryByText("Map")).not.toBeNull();
  });

  it("adds and set Embeddings panel as active", async () => {
    render(<RecoilApp />);

    const [addIcon] = screen.getAllByTestId("AddIcon");
    await userEvent.click(addIcon);
    const panelPopup = screen.queryByTestId("addPanelPopup") as HTMLElement;
    await userEvent.click(within(panelPopup).queryByText("Embeddings"));
    // screen.debug();
  });
});
