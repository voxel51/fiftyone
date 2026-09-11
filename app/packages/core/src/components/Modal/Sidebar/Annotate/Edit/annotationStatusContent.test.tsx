/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { aiSegmentationStatus } from "./annotationStatusContent";

const renderHelp = (help: React.ReactElement | undefined) => {
  expect(help).toBeTruthy();
  render(help as React.ReactElement);
};

describe("aiSegmentationStatus", () => {
  afterEach(cleanup);

  it("keeps the gesture table when an error carries a message", () => {
    const content = aiSegmentationStatus({
      status: "error",
      progress: null,
      error: { kind: "encoder_failure", message: "out of memory" },
    });

    renderHelp(content?.help);

    expect(screen.getByText("out of memory")).toBeTruthy();
    expect(screen.getByText("AI segmentation")).toBeTruthy();
    expect(screen.getByText("Shift + click")).toBeTruthy();
  });

  it("still offers help when an error carries no message", () => {
    const content = aiSegmentationStatus({
      status: "error",
      progress: null,
      error: { kind: "unsupported", message: "" },
    });

    renderHelp(content?.help);

    expect(screen.getByText("AI segmentation")).toBeTruthy();
  });

  it("offers help while inference is running", () => {
    const content = aiSegmentationStatus({
      status: "inferring",
      progress: null,
      error: null,
    });

    renderHelp(content?.help);

    expect(screen.getByText("AI segmentation")).toBeTruthy();
  });
});
