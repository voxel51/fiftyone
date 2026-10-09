import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/components", () => ({
  ColoredDot: () => null,
  Popout: () => null,
  scrollable: "scrollable",
}));
vi.mock("@fiftyone/state", () => ({
  canEditWorkspaces: "canEditWorkspaces",
  sessionSpaces: "sessionSpaces",
}));
vi.mock("@fiftyone/reverb", () => ({
  useReverbValue: (atom: string) =>
    atom === "sessionSpaces" ? { _name: undefined } : { enabled: true },
  useSetReverbState: () => () => undefined,
}));
vi.mock("../../state", () => ({
  workspaceEditorStateAtom: "workspaceEditorStateAtom",
}));
vi.mock("./WorkspaceEditor", () => ({ default: () => null }));
vi.mock("./hooks", () => ({
  useWorkspaces: () => ({
    workspaces: [],
    loadWorkspace: () => undefined,
    initialized: true,
    listWorkspace: () => undefined,
    canInitialize: true,
  }),
}));

import Workspaces from ".";

describe("Workspaces", () => {
  afterEach(cleanup);

  it("takes no height above the tab row when it mounts after load", () => {
    const { container } = render(<Workspaces />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeTruthy();
    expect(getComputedStyle(root).height).toBe("0px");
  });
});
