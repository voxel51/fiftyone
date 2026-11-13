import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActionSurface from "./ActionSurface";

afterEach(cleanup);

function setup(dismissible: boolean) {
  const onClose = vi.fn();
  render(
    <>
      <ActionSurface
        open
        onClose={onClose}
        title="Tag"
        dismissible={dismissible}
        trigger={
          <button type="button" data-tray-action="">
            Tag
          </button>
        }
      >
        <button type="button">Inside</button>
      </ActionSurface>
      <button type="button" data-tray-action="">
        Save as subset
      </button>
      <button type="button">Elsewhere</button>
    </>,
  );
  const press = (name: string) =>
    fireEvent.pointerDown(screen.getByRole("button", { name }));
  return { onClose, press };
}

describe("ActionSurface", () => {
  it("keeps a sticky panel open until another tray action is pressed", () => {
    const { onClose, press } = setup(false);
    press("Elsewhere");
    press("Inside");
    press("Tag");
    expect(onClose).not.toHaveBeenCalled();
    press("Save as subset");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
