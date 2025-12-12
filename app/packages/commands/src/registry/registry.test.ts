/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandRegistry } from "./registry";

describe("CommandRegistry", () => {
    let registry: CommandRegistry;
    const cmdOne = "fo.test.command";
    const cmdTwo = "fo.test.command2";
    beforeEach(() => {
        registry = new CommandRegistry();
    });

    it("can register commands", async () => {
        let command = await registry.registerCommand(cmdOne, async () => {
            return;
        });
        expect(command).toBeDefined();
        command = await registry.registerCommand(
            cmdTwo,
            async () => {
                return;
            },
            undefined,
            "fo",
            "test fo command",
            () => {
                return false;
            }
        );
        expect(command.enabled).toBe(false);
        expect(registry.getCommand(cmdOne)).toBeDefined();
        expect(registry.getCommand(cmdTwo)).toBeDefined();
    });

    it("can unregister commands", async () => {
        let command = await registry.registerCommand(cmdOne, async () => {
            return;
        });
        expect(command).toBeDefined();
        command = await registry.registerCommand(
            cmdTwo,
            async () => {
                return;
            },
            undefined,
            "fo",
            "test fo command",
            () => {
                return true;
            }
        );
        expect(command).toBeDefined();

        expect(registry.getCommand(cmdOne)).toBeDefined();
        expect(registry.getCommand(cmdTwo)).toBeDefined();

        registry.unregisterCommand(cmdOne);
        expect(registry.getCommand(cmdOne)).toBeUndefined();

        registry.unregisterCommand(cmdTwo);
        expect(registry.getCommand(cmdTwo)).toBeUndefined();
    });

    it("can execute a registered command", async () => {
        const testFunc = vi.fn(() => { return; });

        const command = await registry.registerCommand(
            cmdOne,
            async () => {
                testFunc();
            },
            undefined,
            "fo",
            "test fo command",
            () => {
                //command is always enabled
                return true;
            }
        );
        expect(registry.getCommand(cmdOne)).toBeDefined();
        expect(await registry.executeCommand(cmdOne)).toEqual(true);
        expect(testFunc).toBeCalledTimes(1);
    });
    it("does not execute a registered command that is disabled", async () => {
        const testFunc = vi.fn(() => { return; });

        const command = await registry.registerCommand(
            cmdOne,
            async () => {
                testFunc();
            },
            undefined,
            "fo",
            "test fo command",
            () => {
                //command is always disabled
                return false;
            }
        );
        expect(registry.getCommand(cmdOne)).toBeDefined();
        expect(await registry.executeCommand(cmdOne)).toEqual(false);
        expect(testFunc).toBeCalledTimes(0);
    });
});
