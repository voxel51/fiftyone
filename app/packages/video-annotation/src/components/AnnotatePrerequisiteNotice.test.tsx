import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AnnotatePrerequisiteChecking,
  AnnotatePrerequisiteNotice,
} from "./AnnotatePrerequisiteNotice";

describe("AnnotatePrerequisiteNotice", () => {
  it("renders the metadata prompt", () => {
    const { container, getByText } = render(
      <AnnotatePrerequisiteNotice blocker="metadata" />
    );

    expect(
      container.querySelector('[data-cy="video-annotate-prerequisite-notice"]')
    ).toBeTruthy();
    getByText("Computed metadata required");
    getByText(/compute_metadata/);
  });

  it("renders the frames prompt", () => {
    const { getByText } = render(
      <AnnotatePrerequisiteNotice blocker="frames" />
    );

    getByText("Frames not sampled");
    getByText(/to_frames/);
  });
});

describe("AnnotatePrerequisiteChecking", () => {
  it("renders a checking placeholder", () => {
    const { container } = render(<AnnotatePrerequisiteChecking />);

    expect(
      container.querySelector(
        '[data-cy="video-annotate-prerequisite-checking"]'
      )
    ).toBeTruthy();
  });
});
