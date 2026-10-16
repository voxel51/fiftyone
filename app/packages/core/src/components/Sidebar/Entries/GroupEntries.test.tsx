import * as fos from "@fiftyone/state";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { ThemeProvider } from "styled-components";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PathGroupEntry } from "./GroupEntries";

const { theme, actions } = vi.hoisted(() => ({
  theme: {
    primary: { softBorder: "#333333", plainColor: "#ff8800" },
    neutral: { softBg: "#222222" },
    text: { secondary: "#aaaaaa", primary: "#ffffff" },
    background: { level2: "#111111" },
    custom: { shadow: "#000000" },
  },
  actions: {
    clearFiltered: vi.fn(),
    clearVisible: vi.fn(),
    clearActive: vi.fn(),
    rename: vi.fn(async () => true),
    delete: vi.fn(),
    drag: vi.fn(),
  },
}));

vi.mock("@fiftyone/components", () => ({
  useTheme: () => theme,
  PillButton: ({
    onClick,
    text,
    title,
  }: {
    onClick: React.MouseEventHandler<HTMLButtonElement>;
    text: string;
    title: string;
  }) => (
    <button
      title={title}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {text}
    </button>
  ),
}));

vi.mock("@fiftyone/state", async () => {
  const { atomFamily, constSelector } = await import("recoil");
  const shown = atomFamily<boolean, { group: string; modal: boolean }>({
    key: "test_group_header_shown",
    default: false,
  });
  return {
    groupShown: ({ group, modal }: { group: string; modal: boolean }) =>
      shown({ group, modal }),
    canModifySidebarGroup: constSelector({ enabled: true }),
    isFieldVisibilityActive: constSelector(false),
    useNotification: () => vi.fn(),
    TAGS_FIELD: "tags",
    LABEL_TAGS_FIELD: "_label_tags",
  };
});

vi.mock("@fiftyone/state/src/recoil/groupEntries", async () => {
  const { constSelector } = await import("recoil");
  return {
    numGroupFieldsActive: () => constSelector(1),
    numGroupFieldsFiltered: () => constSelector(1),
    numGroupFieldsVisible: () => constSelector(1),
  };
});

vi.mock("@fiftyone/state/src/hooks/useGroupEntries", () => ({
  useClearActive: () => actions.clearActive,
  useClearFiltered: () => actions.clearFiltered,
  useClearVisibility: () => actions.clearVisible,
  useDeleteGroup: () => actions.delete,
  useRenameGroup: () => actions.rename,
}));

const Expansion = () => {
  const expanded = useRecoilValue(
    fos.groupShown({ group: "events", modal: false, loading: true }),
  );
  return <output data-testid="expanded">{String(expanded)}</output>;
};

const renderGroup = () =>
  render(
    <RecoilRoot>
      <ThemeProvider theme={theme}>
        <PathGroupEntry
          entryKey='["group","events"]'
          name="events"
          modal={false}
          trigger={actions.drag}
        />
        <Expansion />
      </ThemeProvider>
    </RecoilRoot>,
  );

const clickHeader = (movement = 0) => {
  const header = screen.getByTitle("EVENTS");
  fireEvent.mouseDown(header, { clientX: 80, clientY: 20 });
  if (movement) {
    fireEvent.mouseMove(header, { clientX: 80 + movement, clientY: 20 });
  }
  fireEvent.mouseUp(header, { clientX: 80 + movement, clientY: 20 });
  fireEvent.click(header, { clientX: 80 + movement, clientY: 20 });
};

describe("sidebar group clicks", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([0, 1, 3])(
    "toggles once with %i pixels of pointer movement",
    (movement) => {
      renderGroup();
      clickHeader(movement);
      expect(screen.getByTestId("expanded").textContent).toBe("true");
      clickHeader(movement);
      expect(screen.getByTestId("expanded").textContent).toBe("false");
      expect(actions.drag).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Clear events filters", "clearFiltered"],
    ["Clear events visibility", "clearVisible"],
    ["Clear shown events", "clearActive"],
  ] as const)("keeps the group open when using %s", (title, action) => {
    renderGroup();
    clickHeader();
    fireEvent.click(screen.getByTitle(title));
    expect(actions[action]).toHaveBeenCalledOnce();
    expect(screen.getByTestId("expanded").textContent).toBe("true");
  });

  it("keeps expansion unchanged while renaming", () => {
    renderGroup();
    clickHeader();
    fireEvent.mouseEnter(screen.getByTitle("EVENTS"));
    fireEvent.click(screen.getByTitle("Rename group").querySelector("svg")!);
    const input = screen.getByDisplayValue("EVENTS");
    fireEvent.mouseDown(input);
    fireEvent.mouseUp(input);
    fireEvent.click(input);
    expect(screen.getByTestId("expanded").textContent).toBe("true");
    expect(document.activeElement).toBe(input);
  });

  it("does not toggle the group when deleting", () => {
    renderGroup();
    clickHeader();
    fireEvent.click(screen.getByTitle("Delete group").querySelector("svg")!);
    expect(actions.delete).toHaveBeenCalledOnce();
    expect(screen.getByTestId("expanded").textContent).toBe("true");
  });

  it("does not collapse when a header press ends editing", () => {
    renderGroup();
    clickHeader();
    const header = screen.getByTitle("EVENTS");
    fireEvent.mouseEnter(header);
    fireEvent.click(screen.getByTitle("Rename group").querySelector("svg")!);
    const input = screen.getByDisplayValue("EVENTS");
    fireEvent.mouseDown(header);
    fireEvent.blur(input);
    fireEvent.mouseUp(header);
    fireEvent.click(header);
    expect(screen.getByTestId("expanded").textContent).toBe("true");
  });

  it.each([
    "Clear events filters",
    "Clear events visibility",
    "Clear shown events",
    "Rename group",
    "Delete group",
  ])("does not toggle when a press starts on %s", (title) => {
    renderGroup();
    clickHeader();
    const header = screen.getByTitle("EVENTS");
    fireEvent.mouseEnter(header);
    const control = screen.getByTitle(title);
    fireEvent.mouseDown(control.querySelector("svg") ?? control);
    fireEvent.mouseMove(header);
    fireEvent.mouseUp(header);
    // The browser targets the shared ancestor when release misses a control.
    fireEvent.click(header);
    expect(screen.getByTestId("expanded").textContent).toBe("true");
  });

  it("starts reordering from the drag handle without expanding", () => {
    renderGroup();
    const handle = screen.getByTitle("Drag to reorder");
    fireEvent.mouseDown(handle);
    expect(actions.drag).toHaveBeenCalledWith(
      expect.anything(),
      '["group","events"]',
      expect.any(Function),
    );
    expect(screen.getByTestId("expanded").textContent).toBe("false");
  });
});
