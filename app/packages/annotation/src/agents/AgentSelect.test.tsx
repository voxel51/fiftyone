import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const selector = vi.fn();
vi.mock("./hooks", () => ({ useAgentSelector: () => selector() }));

// Avoid loading the full components barrel; only the URL constant is used.
vi.mock("@fiftyone/components", () => ({
  ENTERPRISE_LEARN_MORE_URL:
    "https://voxel51.com/why-upgrade?utm_source=FiftyOneApp",
}));

// Stub voodo: render each option as a clickable button so the test can drive
// the Select's onChange, and read which options were offered.
vi.mock("@voxel51/voodo", () => ({
  FormField: ({ control }: { control: unknown }) => control,
  Select: ({
    options,
    onChange,
  }: {
    options: { id: string; data: { label: string } }[];
    onChange: (id: string) => void;
  }) => (
    <div data-testid="opts">
      {options.map((o) => (
        <button
          key={o.id}
          data-testid={`opt-${o.id}`}
          onClick={() => onChange(o.id)}
        >
          {o.data.label}
        </button>
      ))}
    </div>
  ),
  Icon: () => null,
  Text: ({ children }: { children: unknown }) => <span>{children}</span>,
  Stack: ({ children }: { children: unknown }) => <div>{children}</div>,
  Align: {},
  Justify: {},
  Orientation: {},
  Size: {},
  Spacing: {},
  TextColor: {},
  TextVariant: {},
  IconName: { ExternalLink: "ExternalLink" },
}));

import { AgentSelect } from "./AgentSelect";

const agent = (id: string, unlisted?: boolean) => ({
  id,
  label: id,
  agent: {} as never,
  unlisted,
});

const selectorState = (agents: ReturnType<typeof agent>[]) => ({
  agents,
  isResolved: true,
  activeAgent: null,
  setActiveAgent: vi.fn(),
});

const UPSELL_ID = "enterprise:sam2-large";

beforeEach(() => selector.mockReset());
afterEach(cleanup);

describe("AgentSelect", () => {
  it("lists selectable agents and hides unlisted ones", () => {
    selector.mockReturnValue(
      selectorState([agent("a"), agent("b", true), agent("c")]),
    );
    render(<AgentSelect />);

    expect(screen.queryByTestId("opt-a")).toBeTruthy();
    expect(screen.queryByTestId("opt-b")).toBeNull(); // unlisted -> dropped
    expect(screen.queryByTestId("opt-c")).toBeTruthy();
  });

  it("omits the Enterprise upsell by default and appends it when opted in", () => {
    selector.mockReturnValue(selectorState([agent("a")]));
    const { rerender } = render(<AgentSelect />);
    expect(screen.queryByTestId(`opt-${UPSELL_ID}`)).toBeNull();

    rerender(<AgentSelect showEnterpriseUpsell />);
    expect(screen.queryByTestId(`opt-${UPSELL_ID}`)).toBeTruthy();
  });

  it("opens pricing and does not change selection when the upsell row is clicked", () => {
    const onChange = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    selector.mockReturnValue(selectorState([agent("a")]));
    render(<AgentSelect onChange={onChange} showEnterpriseUpsell />);

    fireEvent.click(screen.getByTestId(`opt-${UPSELL_ID}`));

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("voxel51.com/why-upgrade"),
      "_blank",
      "noopener,noreferrer",
    );
    expect(onChange).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("selects a real agent through onChange", () => {
    const onChange = vi.fn();
    selector.mockReturnValue(selectorState([agent("a")]));
    render(<AgentSelect onChange={onChange} />);

    fireEvent.click(screen.getByTestId("opt-a"));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });
});
