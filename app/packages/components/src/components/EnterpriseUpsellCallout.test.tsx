import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@voxel51/voodo", () => ({
  Card: ({ children }: { children: unknown }) => <div>{children}</div>,
  Stack: ({ children }: { children: unknown }) => <div>{children}</div>,
  Text: ({ children }: { children: unknown }) => <span>{children}</span>,
  Icon: () => null,
  Button: ({
    children,
    onClick,
  }: {
    children: unknown;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  Align: {},
  CardBackground: {},
  IconName: { AI: "AI", ExternalLink: "ExternalLink" },
  Orientation: {},
  Size: {},
  Spacing: {},
  TextColor: {},
  TextVariant: {},
  Variant: {},
}));

import EnterpriseUpsellCallout from "./EnterpriseUpsellCallout";

const props = {
  title: "More powerful AI in Enterprise",
  description: "Upgrade to unlock more.",
  learnMoreUrl: "https://voxel51.com/why-upgrade",
};

afterEach(cleanup);

describe("EnterpriseUpsellCallout", () => {
  it("renders the title and description", () => {
    render(<EnterpriseUpsellCallout {...props} />);
    expect(screen.getByText(props.title)).toBeTruthy();
    expect(screen.getByText(props.description)).toBeTruthy();
  });

  it("opens the provided learn-more url in a new tab", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<EnterpriseUpsellCallout {...props} />);

    fireEvent.click(screen.getByText("Learn more"));

    expect(open).toHaveBeenCalledWith(
      props.learnMoreUrl,
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("falls back to the default learn-more url when none is provided", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <EnterpriseUpsellCallout
        title={props.title}
        description={props.description}
      />,
    );

    fireEvent.click(screen.getByText("Learn more"));

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("voxel51.com/why-upgrade"),
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("renders Dismiss only when onDismiss is provided and fires it", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<EnterpriseUpsellCallout {...props} />);
    expect(screen.queryByText("Dismiss")).toBeNull();

    rerender(<EnterpriseUpsellCallout {...props} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
