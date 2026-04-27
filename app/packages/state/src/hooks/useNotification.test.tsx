import type { ButtonProps, IconButtonProps, StackProps } from "@mui/material";
import { render, renderHook } from "@testing-library/react";
import {
  closeSnackbar,
  enqueueSnackbar,
  OptionsObject,
  SnackbarMessage,
} from "notistack";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useNotification from "./useNotification";

const NOTIFICATION_MESSAGE = "Test notification";
const NOTIFICATION_KEY = "test-notification-key";

vi.mock("notistack", () => ({
  enqueueSnackbar: vi.fn(),
  closeSnackbar: vi.fn(),
}));

// MUI components used in the action JSX
vi.mock("@mui/material", () => ({
  Button: ({ children, onClick, href, ...props }: ButtonProps) =>
    React.createElement("button", { onClick, href, ...props }, children),
  IconButton: ({ children, onClick }: IconButtonProps) =>
    React.createElement("button", { onClick }, children),
  Stack: ({ children }: StackProps) =>
    React.createElement("div", null, children),
}));

vi.mock("@mui/icons-material/Close", () => ({
  default: () => React.createElement("span", null, "Close"),
}));

type EnqueueOptions = OptionsObject & { message?: SnackbarMessage };

const mockEnqueueSnackbar = vi.mocked(enqueueSnackbar);
const mockCloseSnackbar = vi.mocked(closeSnackbar);

const getCallParams = (callIndex = 0): EnqueueOptions =>
  mockEnqueueSnackbar.mock.calls[callIndex][0] as EnqueueOptions;

describe("useNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a callable function", () => {
    const { result } = renderHook(() => useNotification());
    expect(typeof result.current).toBe("function");
  });

  it("calls enqueueSnackbar with the correct base options", () => {
    const { result } = renderHook(() => useNotification());

    result.current({ msg: NOTIFICATION_MESSAGE });

    expect(mockEnqueueSnackbar).toHaveBeenCalledOnce();
    const params = getCallParams();
    expect(params.key).toBe(NOTIFICATION_MESSAGE);
    expect(params.message).toBe(NOTIFICATION_MESSAGE);
    expect(params.anchorOrigin).toEqual({
      horizontal: "center",
      vertical: "bottom",
    });
    expect(params.autoHideDuration).toBe(3000);
    expect(params.preventDuplicate).toBe(true);
  });

  it("passes extra options through to enqueueSnackbar", () => {
    const { result } = renderHook(() => useNotification());

    result.current({
      msg: NOTIFICATION_MESSAGE,
      variant: "success",
      autoHideDuration: 5000,
      preventDuplicate: false,
      key: NOTIFICATION_KEY,
      anchorOrigin: { horizontal: "left", vertical: "top" },
    });

    const { variant, autoHideDuration, preventDuplicate, key } =
      getCallParams();

    expect(variant).toBe("success");
    expect(autoHideDuration).toBe(5000);
    expect(preventDuplicate).toBe(false);
    expect(key).toBe(NOTIFICATION_KEY);
    expect(getCallParams().anchorOrigin).toEqual({
      horizontal: "left",
      vertical: "top",
    });
  });

  it("uses a provided numeric key of 0 for enqueue and close", () => {
    const { result } = renderHook(() => useNotification());
    result.current({ msg: NOTIFICATION_MESSAGE, key: 0 });
    expect(getCallParams().key).toBe(0);
    const action = getCallParams().action as React.ReactElement;
    const { container } = render(action);
    const buttons = container.querySelectorAll("button");
    buttons[buttons.length - 1].click();
    expect(mockCloseSnackbar).toHaveBeenCalledWith(0);
  });

  it("uses a provided empty string key for enqueue and close", () => {
    const { result } = renderHook(() => useNotification());
    result.current({ msg: NOTIFICATION_MESSAGE, key: "" });
    expect(getCallParams().key).toBe("");
    const action = getCallParams().action as React.ReactElement;
    const { container } = render(action);
    const buttons = container.querySelectorAll("button");
    buttons[buttons.length - 1].click();
    expect(mockCloseSnackbar).toHaveBeenCalledWith("");
  });

  it("renders action as a valid React element", () => {
    const { result } = renderHook(() => useNotification());

    result.current({ msg: NOTIFICATION_MESSAGE });

    const action = getCallParams().action as React.ReactElement;
    expect(React.isValidElement(action)).toBe(true);
  });

  it("includes action buttons for each provided action", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useNotification());

    result.current({
      msg: NOTIFICATION_MESSAGE,
      actions: [
        { label: "View details", onClick },
        { label: "Docs", href: "https://fiftyone.ai" },
      ],
    });

    const action = getCallParams().action as React.ReactElement;
    const { container } = render(action);
    const buttons = container.querySelectorAll("button");
    const viewDetailsButton = buttons[0];
    const docsButton = buttons[1];
    // Two action buttons + one close button
    expect(buttons.length).toBe(3);
    expect(viewDetailsButton.textContent).toBe("View details");
    expect(docsButton.getAttribute("href")).toBe("https://fiftyone.ai");
  });

  it("action button onClick handler is wired correctly", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useNotification());

    result.current({
      msg: NOTIFICATION_MESSAGE,
      actions: [{ label: "View details", onClick }],
    });

    const action = getCallParams().action as React.ReactElement;
    const { container } = render(action);
    const buttons = container.querySelectorAll("button");
    const viewDetailsButton = buttons[0];
    viewDetailsButton.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("close button calls closeSnackbar with the message as key", () => {
    const { result } = renderHook(() => useNotification());

    result.current({ msg: NOTIFICATION_MESSAGE });

    const action = getCallParams().action as React.ReactElement;
    const { container } = render(action);
    const buttons = container.querySelectorAll("button");
    // Last button is the close (IconButton)
    buttons[buttons.length - 1].click();
    expect(mockCloseSnackbar).toHaveBeenCalledWith(NOTIFICATION_MESSAGE);
  });

  it("close button calls closeSnackbar with the key if provided", () => {
    const { result } = renderHook(() => useNotification());

    result.current({ msg: NOTIFICATION_MESSAGE, key: NOTIFICATION_KEY });

    const action = getCallParams().action as React.ReactElement;
    const { container } = render(action);
    const buttons = container.querySelectorAll("button");
    // Last button is the close (IconButton)
    buttons[buttons.length - 1].click();
    expect(mockCloseSnackbar).toHaveBeenCalledWith(NOTIFICATION_KEY);
  });

  it("defaults to an empty actions array when actions are not provided", () => {
    const { result } = renderHook(() => useNotification());

    result.current({ msg: NOTIFICATION_MESSAGE });

    const action = getCallParams().action as React.ReactElement;
    const { container } = render(action);
    // Only the close button should be present
    expect(container.querySelectorAll("button").length).toBe(1);
  });

  it("preventDuplicate defaults to true", () => {
    const { result } = renderHook(() => useNotification());

    result.current({ msg: NOTIFICATION_MESSAGE });
    result.current({ msg: NOTIFICATION_MESSAGE });

    expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(2);
    expect(getCallParams(0).preventDuplicate).toBe(true);
    expect(getCallParams(1).preventDuplicate).toBe(true);
  });
});
