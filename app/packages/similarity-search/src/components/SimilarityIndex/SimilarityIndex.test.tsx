// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pendingRuns = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("@fiftyone/components", () => ({
  PendingRunCard: ({
    title,
    runState,
    onOpen,
  }: {
    title: string;
    runState: string;
    onOpen?: () => void;
  }) => <div onClick={onOpen}>{`${title} ${runState}`}</div>,
  RunScreen: ({ title, onBack }: { title: string; onBack: () => void }) => (
    <div onClick={onBack}>{`screen ${title}`}</div>
  ),
}));
vi.mock("@fiftyone/operators", async () => {
  const { useState } = await import("react");
  return {
    usePendingRunScreen: (runs: { id: string; brain_key: string | null }[]) => {
      const [id, setId] = useState<string | null>(null);
      const run = runs.find((candidate) => candidate.id === id);
      return {
        open: setId,
        screen: run && { title: run.brain_key, onBack: () => setId(null) },
      };
    },
  };
});
vi.mock("@fiftyone/utilities", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  constants: { IS_APP_MODE_FIFTYONE: true },
}));
vi.mock("../SimilaritySearchCTA", () => ({
  default: () => <div>onboarding</div>,
}));
vi.mock("@voxel51/voodo", () => {
  const Passthrough = ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  );
  return {
    Button: Passthrough,
    Icon: () => null,
    RichList: () => null,
    Stack: Passthrough,
    Text: Passthrough,
    Tooltip: Passthrough,
    Align: {},
    IconColor: {},
    IconName: {},
    Justify: {},
    Orientation: {},
    Size: {},
    Spacing: {},
    TextColor: {},
    TextVariant: {},
    Variant: {},
  };
});

import SimilarityIndex from "./SimilarityIndex";

const pending = (brain_key: string) => ({
  id: "1",
  operator: "op",
  run_state: "running",
  label: null,
  brain_key,
});

afterEach(cleanup);

describe("SimilarityIndex pending runs", () => {
  it("shows a pending run instead of the onboarding CTA", () => {
    pendingRuns.current = [pending("sim_new")];
    render(
      <SimilarityIndex
        brainKeys={[]}
        pendingRuns={pendingRuns.current as never}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("sim_new running")).toBeTruthy();
    expect(screen.queryByText("onboarding")).toBeNull();
  });

  it("opens a pending run's screen on click and returns on back", () => {
    pendingRuns.current = [pending("sim_new")];
    render(
      <SimilarityIndex
        brainKeys={[]}
        pendingRuns={pendingRuns.current as never}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("sim_new running"));
    expect(screen.queryByText("sim_new running")).toBeNull();

    fireEvent.click(screen.getByText("screen sim_new"));
    expect(screen.getByText("sim_new running")).toBeTruthy();
  });

  it("keeps the onboarding CTA when nothing is pending", () => {
    pendingRuns.current = [];
    render(
      <SimilarityIndex
        brainKeys={[]}
        pendingRuns={pendingRuns.current as never}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("onboarding")).toBeTruthy();
  });
});
