/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { KeyManager } from "./KeyManager";
import { CommandRegistry } from "../registry";
import { ActionManager } from "../actions";

describe("KeyManager", () => {
    let keyManager: KeyManager;
    let commandRegistry: CommandRegistry;
    beforeEach(() => {
        commandRegistry = new CommandRegistry(new ActionManager());
        keyManager = new KeyManager(commandRegistry);
    });

    it("can register a binding", async () => {
        const command = commandRegistry.registerCommand(
            "fo.test.command",
            async () => {
                return;
            },
            () => { return true; }
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey("ctrl+s", "fo.test.command");
        }).not.toThrow();
    });
    it("does not register bindings for undefined commands", () => {
        expect(() => {
            keyManager.bindKey("ctrl+s", "fo.unregistered");
        }).toThrowError(
            "The command id fo.unregistered is not registered for binding ctrl+s"
        );
    });
    it("can match a single sequence command binding", async () => {
        const keyEvent = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const command = commandRegistry.registerCommand(
            "fo.test.command",
            async () => {
                return;
            },
            () => { return true; }
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey("ctrl+s", "fo.test.command");
        }).not.toThrow();
        const state = keyManager.match(keyEvent);
        expect(state.full).toBeDefined();
    });

    it("does not match a single sequence command binding with unexpected modifier keys", async () => {
        const keyEvent = new KeyboardEvent("keydown", { ctrlKey: true, altKey: true, key: "s" });
        const command = commandRegistry.registerCommand(
            "fo.test.command",
            async () => {
                return;
            },
            () => { return true; }
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey("ctrl+s", "fo.test.command");
        }).not.toThrow();
        const state = keyManager.match(keyEvent);
        expect(state.full).toBeUndefined();
    });

    it("can match a command binding with two sequences", async () => {
        const keyEvent1 = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const keyEvent2 = new KeyboardEvent("keydown", { altKey: true, key: "d" });
        const command = commandRegistry.registerCommand(
            "fo.test.command",
            async () => {
                return;
            },
            () => { return true; }
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey(
                "ctrl+s, alt+d",
                "fo.test.command"
            );
        }).not.toThrow();
        let state = keyManager.match(keyEvent1);
        expect(state.partial).toBe(true);
        state = keyManager.match(keyEvent2);
        expect(state.full).toBeDefined();
    });

    it("can match a command binding with three sequences", async () => {
        const keyEvent1 = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const keyEvent2 = new KeyboardEvent("keydown", { altKey: true, key: "d" });
        const keyEvent3 = new KeyboardEvent("keydown", { metaKey: true, key: "p" });
        const command = commandRegistry.registerCommand(
            "fo.test.command",
            async () => { return; },
            () => { return true; }
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey(
                "ctrl+s, alt+d, meta+p",
                "fo.test.command"
            );
        }).not.toThrow();
        let state = keyManager.match(keyEvent1);
        expect(state.partial).toBe(true);
        expect(state.full).toBeUndefined();
        state = keyManager.match(keyEvent2);
        expect(state.partial).toBe(true);
        expect(state.full).toBeUndefined();
        state = keyManager.match(keyEvent3);
        expect(state.full).toBeDefined();
        expect(state.partial).toBe(false);
    });
    it("can match a command binding with multiple sequences with overlapped bindings", async () => {
        const keyEvent1 = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const keyEvent2 = new KeyboardEvent("keydown", { altKey: true, key: "d" });
        const keyEvent3 = new KeyboardEvent("keydown", { altKey: true, key: "x" });

        const command1 = commandRegistry.registerCommand(
            "fo.test.command1",
            async () => { return; },
            () => { return true; }
        );
        expect(command1).toBeDefined();
        const command2 = commandRegistry.registerCommand(
            "fo.test.command2",
            async () => { return; },
            () => { return true; }
        );
        expect(command2).toBeDefined();
        //The start sequence ctrl+s is the same for both commands, one is User the other Core
        expect(() => {
            keyManager.bindKey(
                "ctrl+s, alt+d",
                "fo.test.command1"
            );
        }).not.toThrow();
        expect(() => {
            keyManager.bindKey(
                "ctrl+s, alt+x",
                "fo.test.command2"
            );
        }).not.toThrow();
        let state = keyManager.match(keyEvent1);
        expect(state.partial).toBe(true);
        expect(state.full).toBeUndefined();
        state = keyManager.match(keyEvent2);
        expect(state.full).toBeDefined();
        expect(state.partial).toBe(false);
        //The command is matched, make sure it has cleared the first match and cannot invoke the 2nd command
        state = keyManager.match(keyEvent3);
        expect(state.partial).toBe(false);
        expect(state.full).toBeUndefined();
    });

    it("properly terminates a key sequence", async () => {
        //full sequence:
        //ctrl+s, q, alt+d, q, ctrl+s, alt+d (fires command)
        const keyEvent1 = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const keyEvent2 = new KeyboardEvent("keydown", { altKey: true, key: "d" });
        const badEvent = new KeyboardEvent("keydown", { key: "q" });
        const command = commandRegistry.registerCommand(
            "fo.test.command",
            async () => { return; },
            () => { return true; }
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey(
                "ctrl+s, alt+d",
                "fo.test.command"
            );
        }).not.toThrow();
        //first event matches ctrl+s
        let state = keyManager.match(keyEvent1);
        expect(state.partial).toBe(true);
        expect(state.full).toBeUndefined();
        //send a non-matching event
        state = keyManager.match(badEvent);
        expect(state.partial).toBe(false);
        expect(state.full).toBeUndefined();
        //now send the 2nd part of the sequence alt+d, should not match
        state = keyManager.match(keyEvent2);
        //make sure it is not invoked
        expect(state.partial).toBe(false);
        expect(state.full).toBeUndefined();
        //send the matching sequence and make sure it fires
        state = keyManager.match(keyEvent1);
        expect(state.partial).toBe(true);
        expect(state.full).toBeUndefined();
        state = keyManager.match(keyEvent2);
        expect(state.partial).toBe(false);
        expect(state.full).toBeDefined();
    });

    it("will not register the same binding in the same scope", async () => {
        const command1 = commandRegistry.registerCommand(
            "fo.test.command1",
            async () => { return; },
            () => { return true; }
        );
        expect(command1).toBeDefined();
        const command2 = commandRegistry.registerCommand(
            "fo.test.command2",
            async () => { return; },
            () => { return true; }
        );
        const binding = "ctrl+s, alt+d";
        expect(() => {
            keyManager.bindKey(
                binding,
                "fo.test.command1"
            );
        }).not.toThrow();
        expect(() => {
            keyManager.bindKey(
                binding,
                "fo.test.command2"
            );
        }).toThrowError(`The binding ${binding} is already bound in this context`)
        expect(command2).toBeDefined();
    });
});
