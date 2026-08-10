import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EpisodeLogConsoleRow } from "./log-console-rows";
import {
  diagnosticConsoleResultSummary,
  LogConsole,
  type LogConsoleProps,
  logConsoleResultSummary,
} from "./LogConsole";

vi.mock("@voxel51/voodo", () => ({
  Checkbox: ({
    checked,
    label,
    onChange,
  }: {
    readonly checked: boolean;
    readonly label: string;
    readonly onChange: (checked: boolean) => void;
  }) => (
    <label>
      <input
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      {label}
    </label>
  ),
}));

afterEach(cleanup);

describe("LogConsole", () => {
  it("switches between the Logs and Diagnostics projections", () => {
    const onViewModeChange = vi.fn();
    render(
      <LogConsole
        {...defaultProps({ firstRows: [] })}
        onViewModeChange={onViewModeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    expect(onViewModeChange).toHaveBeenCalledWith("diagnostics");
  });

  it("anchors Follow to the live tail, suspends on scroll-away, and resumes immediately", () => {
    const onFollowPlayheadChange = vi.fn();
    const firstRows = Array.from({ length: 20 }, (_, index) => row(index));
    const props = defaultProps({ firstRows, onFollowPlayheadChange });
    const view = render(<LogConsole {...props} />);
    const scroll = screen.getByTestId("log-console-scroll");
    let scrollHeight = 600;
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 120 },
      scrollHeight: {
        configurable: true,
        get: () => scrollHeight,
      },
    });

    view.rerender(<LogConsole {...props} tailTimeNs={2n} />);
    expect(scroll.scrollTop).toBe(480);

    scrollHeight = 660;
    const nextRows = [...firstRows, row(20), row(21)];
    view.rerender(<LogConsole {...props} rows={nextRows} tailTimeNs={3n} />);
    expect(scroll.scrollTop).toBe(540);

    scroll.scrollTop = 200;
    fireEvent.scroll(scroll);
    expect(onFollowPlayheadChange).toHaveBeenCalledWith(false);

    scrollHeight = 720;
    view.rerender(
      <LogConsole
        {...props}
        followPlayhead={false}
        rows={[...nextRows, row(22), row(23)]}
        tailTimeNs={4n}
      />,
    );
    expect(scroll.scrollTop).toBe(200);

    view.rerender(
      <LogConsole
        {...props}
        followPlayhead
        rows={[...nextRows, row(22), row(23)]}
        tailTimeNs={4n}
      />,
    );
    expect(scroll.scrollTop).toBe(600);
  });

  it("displays payload time without changing the row's playback identity", () => {
    const onRowClick = vi.fn();
    const stampedRow = row(10, { messageTimeNs: 0n, message: "zero stamp" });

    render(
      <LogConsole
        {...defaultProps({ firstRows: [stampedRow] })}
        onRowClick={onRowClick}
        timeOriginNs={0n}
      />,
    );

    expect(screen.getByText("0.000s")).toBeTruthy();
    fireEvent.click(screen.getByText("zero stamp"));
    expect(onRowClick).toHaveBeenCalledWith(stampedRow);
  });

  it("describes source-search and selected-level retention limits separately", () => {
    expect(
      logConsoleResultSummary({
        retentionTruncated: false,
        rowCount: 8,
        searchIncomplete: true,
        status: "ready",
      }),
    ).toBe("8 retained · window partially searched; matches may be missing");
    expect(
      logConsoleResultSummary({
        retentionTruncated: true,
        rowCount: 2_000,
        searchIncomplete: false,
        status: "ready",
      }),
    ).toContain("older matching rows omitted");
    expect(
      logConsoleResultSummary({
        retentionTruncated: true,
        rowCount: 2_000,
        searchIncomplete: true,
        status: "ready",
      }),
    ).toContain("partial search and retention may omit matches");
  });

  it("renders latest diagnostic status and freshness as separate signals", () => {
    const diagnosticRow = row(4, {
      diagnosticId: "diagnostic",
      groupLabel: "lidar-top / driver",
      kind: "diagnostic",
      level: "error",
      message: "packet drops",
      status: "ERROR",
      stream: "/diagnostics",
    });

    render(
      <LogConsole
        {...defaultProps({ firstRows: [] })}
        diagnostics={[
          {
            ageNs: 12_000_000_000n,
            freshness: "stale",
            id: "diagnostic",
            row: diagnosticRow,
            staleAfterNs: 3_000_000_000n,
          },
        ]}
        viewMode="diagnostics"
      />,
    );

    expect(screen.getByText("ERROR")).toBeTruthy();
    expect(screen.getByText("lidar-top / driver")).toBeTruthy();
    expect(screen.getByText("stale · 12s")).toBeTruthy();
  });

  it("reports incomplete diagnostic search and seed semantics truthfully", () => {
    expect(
      diagnosticConsoleResultSummary({
        rowCount: 3,
        searchIncomplete: true,
        seedIncomplete: false,
        status: "ready",
      }),
    ).toContain("latest states may be missing");
    expect(
      diagnosticConsoleResultSummary({
        rowCount: 3,
        searchIncomplete: false,
        seedIncomplete: true,
        status: "ready",
      }),
    ).toContain("earlier identities may be missing");
    expect(
      diagnosticConsoleResultSummary({
        rowCount: 3,
        searchIncomplete: true,
        seedIncomplete: true,
        status: "ready",
      }),
    ).toContain("latest states and earlier identities may be missing");
  });
});

function defaultProps({
  firstRows,
  onFollowPlayheadChange = vi.fn(),
}: {
  readonly firstRows: readonly EpisodeLogConsoleRow[];
  readonly onFollowPlayheadChange?: (follow: boolean) => void;
}): LogConsoleProps {
  return {
    diagnosticSeedIncomplete: false,
    diagnostics: [],
    followPlayhead: true,
    levels: ["info"],
    onFollowPlayheadChange,
    onLevelChange: vi.fn(),
    onRowClick: vi.fn(),
    onStreamChange: vi.fn(),
    onViewModeChange: vi.fn(),
    retentionTruncated: false,
    rows: firstRows,
    searchIncomplete: false,
    selectedLevels: ["info"],
    selectedStreams: ["/rosout"],
    sources: [{ id: "/rosout", label: "ROS logs" }],
    status: "ready",
    tailTimeNs: 1n,
    timeOriginNs: 0n,
    viewMode: "logs",
    windowLabel: "30s history",
    windowStartNs: 0n,
  };
}

function row(
  time: number,
  overrides: Partial<EpisodeLogConsoleRow> = {},
): EpisodeLogConsoleRow {
  return {
    details: [],
    id: `row-${time}`,
    kind: "log",
    level: "info",
    message: `message-${time}`,
    stream: "/rosout",
    timelineTimeNs: BigInt(time),
    ...overrides,
  };
}
