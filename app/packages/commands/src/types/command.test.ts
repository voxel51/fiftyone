import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "./command";

let execFn: () => void;

beforeEach(() => {
  execFn = vi.fn(() => {
    return;
  });
});

describe("Command", () => {
  it("can execute", () => {
    const cmd = new Command("fo.test.cmd", execFn, () => {
      return true;
    });
    cmd.execute();
    expect(execFn).toBeCalledTimes(1);
  });
  it("can enable/disable", () => {
    let enabled = true;
    const cmd = new Command("fo.test.cmd", execFn, () => {
      return enabled;
    });
    expect(cmd.isEnabled()).toEqual(true);
    enabled = false;
    expect(cmd.isEnabled()).toEqual(false);
  });
  it("does not execute when disabled", () => {
    const enabled = false;
    const cmd = new Command("fo.test.cmd", execFn, () => {
      return enabled;
    });
    expect(cmd.isEnabled()).toEqual(false);
    cmd.execute();
    expect(execFn).not.toBeCalled();
  });
  it("fires notification on enable/disable", () => {
    const listener = vi.fn(() => {
      return;
    });
    let enabled = true;
    const cmd = new Command("fo.test.cmd", execFn, () => {
      return enabled;
    });
    const unsubscribe = cmd.subscribe(listener);
    //toggle enabled and reevaluate
    enabled = false;
    cmd.isEnabled();
    expect(listener).toBeCalledTimes(1);
    //unsubscribe and verify the listener is no longer called
    unsubscribe();
    enabled = true;
    cmd.isEnabled();
    expect(listener).toBeCalledTimes(1);
  });
});
