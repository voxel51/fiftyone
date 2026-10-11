import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppHeader from "./AppHeader";
import Crumb from "./Crumb";
import HeaderLogo from "./HeaderLogo";

const cy = (id: string) => document.querySelector(`[data-cy="${id}"]`);

const focus = (focused: boolean) => ({
  focused,
  toggle: vi.fn(),
  exit: vi.fn(),
});

describe("AppHeader", () => {
  afterEach(cleanup);

  it("puts a slash before each crumb", () => {
    const { container } = render(
      <AppHeader crumbs={[<span key="a">a</span>, <span key="b">b</span>]} />,
    );

    expect(container.querySelectorAll("svg[aria-hidden]")).toHaveLength(2);
  });

  it("orders the right side: actions, focus, utilities, account", () => {
    render(
      <AppHeader
        actions={<span data-cy="actions" />}
        utilities={<span data-cy="utilities" />}
        account={<span data-cy="account" />}
        focus={focus(false)}
      />,
    );
    const order = ["actions", "header-focus", "utilities", "account"].map(cy);

    order.slice(1).forEach((node, index) => {
      expect(
        order[index]!.compareDocumentPosition(node!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it("offers focus mode only when given", () => {
    render(<AppHeader />);

    expect(cy("header-focus")).toBeNull();
  });

  it("folds the row away in focus mode, with a way back", () => {
    const state = focus(true);
    render(<AppHeader focus={state} belowRow={<span data-cy="below" />} />);

    expect(cy("app-header")!.className).toMatch(/focused/);
    expect(cy("below")).not.toBeNull();
    fireEvent.click(cy("header-exit-focus")!);
    expect(state.exit).toHaveBeenCalled();
  });

  it("stays mounted while hidden", () => {
    render(<AppHeader hidden crumbs={[<span key="a" data-cy="crumb" />]} />);

    expect(cy("app-header")!.className).toMatch(/hidden/);
    expect(cy("crumb")).not.toBeNull();
  });
});

describe("HeaderLogo", () => {
  afterEach(cleanup);

  it("is a button when it acts and a link when it leads", () => {
    const onClick = vi.fn();
    render(<HeaderLogo src="" label="Refresh" onClick={onClick} data-cy="a" />);
    render(<HeaderLogo src="" label="Home" href="/home" data-cy="b" />);

    fireEvent.click(cy("a")!);
    expect(onClick).toHaveBeenCalled();
    expect(cy("a")!.tagName).toBe("BUTTON");
    expect(cy("b")!.tagName).toBe("A");
  });
});

describe("Crumb", () => {
  afterEach(cleanup);

  it("is plain text unless it acts or leads", () => {
    render(<Crumb label="text" data-cy="a" />);
    render(<Crumb label="button" onClick={() => undefined} data-cy="b" />);
    render(<Crumb label="link" href="/x" data-cy="c" />);

    expect(cy("a")!.tagName).toBe("SPAN");
    expect(cy("b")!.tagName).toBe("BUTTON");
    expect(cy("c")!.tagName).toBe("A");
  });
});
