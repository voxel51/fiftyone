/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ModalStatusBar,
  StatusContent,
  StatusHelp,
  useModalStatusBar,
} from "./ModalStatusBar";

const helpContent = (
  <StatusHelp
    title="Polyline"
    entries={[{ gesture: "Alt + click", description: "Delete a point" }]}
  />
);

const Registrar = ({ content }: { content: StatusContent }) => {
  const { setContent } = useModalStatusBar();

  useEffect(() => {
    setContent(content);
    return () => setContent(null);
  }, [content, setContent]);

  return null;
};

const renderBar = (content: StatusContent) =>
  render(
    <>
      <Registrar content={content} />
      <ModalStatusBar />
    </>,
  );

describe("ModalStatusBar", () => {
  // unmounting also clears the registered content, so each case starts empty
  afterEach(cleanup);

  it("renders nothing when no content is registered", () => {
    renderBar(null);

    expect(screen.queryByTestId("modal-status-bar")).toBeNull();
  });

  it("renders nothing when content carries neither status nor help", () => {
    renderBar({});

    expect(screen.queryByTestId("modal-status-bar")).toBeNull();
  });

  it("omits the help affordance when content has no help", () => {
    renderBar({ status: <span>3 vertices</span> });

    expect(screen.getByText("3 vertices")).toBeTruthy();
    expect(screen.queryByLabelText("Show instructions")).toBeNull();
  });

  it("shows the help affordance with no inline status", () => {
    renderBar({ help: helpContent });

    expect(screen.getByLabelText("Show instructions")).toBeTruthy();
  });

  it("keeps instructions hidden until the affordance is hovered", async () => {
    renderBar({ status: <span>3 vertices</span>, help: helpContent });

    expect(screen.queryByText("Alt + click")).toBeNull();

    await userEvent.hover(screen.getByLabelText("Show instructions"));

    expect(screen.getByText("Polyline")).toBeTruthy();
    expect(screen.getByText("Alt + click")).toBeTruthy();
    expect(screen.getByText("Delete a point")).toBeTruthy();
  });
});
