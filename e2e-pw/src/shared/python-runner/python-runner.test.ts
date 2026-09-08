/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// `vi.hoisted` runs before module imports, so we can't reference Node built-ins
// inside it. Define just the spy here and build the fake process per-test.

const hoisted = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: hoisted.spawn,
}));

vi.mock("src/oss/utils/dedent", () => ({
  dedentPythonCode: (s: string) => s,
}));

vi.mock("src/oss/utils/fs", () => ({
  writeToTmpFile: vi.fn().mockReturnValue("/tmp/fake.py"),
}));

import { PythonRunner } from "./python-runner";

// ── Helpers ──────────────────────────────────────────────────────────────────

interface FakeProc extends EventEmitter {
  stdout: EventEmitter & { pipe: ReturnType<typeof vi.fn> };
  stderr: EventEmitter & { pipe: ReturnType<typeof vi.fn> };
  pid: number;
}

const makeFakeProc = (): FakeProc => {
  const proc = new EventEmitter() as FakeProc;
  const stdout = new EventEmitter() as EventEmitter & {
    pipe: ReturnType<typeof vi.fn>;
  };
  stdout.pipe = vi.fn();
  const stderr = new EventEmitter() as EventEmitter & {
    pipe: ReturnType<typeof vi.fn>;
  };
  stderr.pipe = vi.fn();
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 12345;
  return proc;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PythonRunner.exec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when the python process exits with code 0", async () => {
    const proc = makeFakeProc();
    hoisted.spawn.mockReturnValue(proc);

    const runner = new PythonRunner(() => "python script.py");
    const promise = runner.exec("print('hi')");

    proc.emit("exit", 0, null);

    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when the python process exits with a non-zero code", async () => {
    const proc = makeFakeProc();
    hoisted.spawn.mockReturnValue(proc);

    const runner = new PythonRunner(() => "python script.py");
    const promise = runner.exec("raise Exception('boom')");

    proc.emit("exit", 1, null);

    await expect(promise).rejects.toThrow(/Python process exited with code 1/);
  });

  it("rejects with the signal in the message when the process is killed by a signal", async () => {
    const proc = makeFakeProc();
    hoisted.spawn.mockReturnValue(proc);

    const runner = new PythonRunner(() => "python script.py");
    const promise = runner.exec("# any code");

    proc.emit("exit", null, "SIGTERM");

    await expect(promise).rejects.toThrow(/signal SIGTERM/);
  });

  it("rejects with the exit code (137 from OOM-killer, for instance)", async () => {
    const proc = makeFakeProc();
    hoisted.spawn.mockReturnValue(proc);

    const runner = new PythonRunner(() => "python script.py");
    const promise = runner.exec("# any code");

    proc.emit("exit", 137, null);

    await expect(promise).rejects.toThrow(/code 137/);
  });
});
