/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeyBindingScope, KeyManager } from "./manager";
import { CommandRegistry } from "../registry";

describe("KeyManager", () => {
    let keyManager: KeyManager;
    let commandRegistry: CommandRegistry;
    beforeEach(() => {
        commandRegistry = new CommandRegistry();
        keyManager = new KeyManager(commandRegistry);
    });

    it("can register binding", async () => {
        const command = await commandRegistry.registerCommand(
            "fo.test.command",
            async () => {
                return;
            }
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey(KeyBindingScope.Core, "ctrl+s", "fo.test.command");
        }).not.toThrow();
    });
    it("does not register bindings for undefined commands", () => {
        expect(() => {
            keyManager.bindKey(KeyBindingScope.Core, "ctrl+s", "fo.unregistered");
        }).toThrowError(
            "The command id fo.unregistered is not registered for binding ctrl+s"
        );
    });
    it("can invoke a single sequence command binding", async () => {
        const keyEvent = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const testFunc = vi.fn(async () => {
            return;
        });
        const command = await commandRegistry.registerCommand(
            "fo.test.command",
            testFunc
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey(KeyBindingScope.Core, "ctrl+s", "fo.test.command");
        }).not.toThrow();
        await keyManager.handleKeyDown(keyEvent);
        expect(testFunc).toHaveBeenCalledTimes(1);
    });

    it("can invoke a command binding with two sequences", async () => {
        const keyEvent1 = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const keyEvent2 = new KeyboardEvent("keydown", { altKey: true, key: "d" });
        const testFunc = vi.fn(async () => {
            return;
        });
        const command = await commandRegistry.registerCommand(
            "fo.test.command",
            testFunc
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.Core,
                "ctrl+s, alt+d",
                "fo.test.command"
            );
        }).not.toThrow();
        await keyManager.handleKeyDown(keyEvent1);
        expect(testFunc).toHaveBeenCalledTimes(0);
        await keyManager.handleKeyDown(keyEvent2);
        expect(testFunc).toHaveBeenCalledTimes(1);
    });

    it("can invoke a command binding with three sequences", async () => {
        const keyEvent1 = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const keyEvent2 = new KeyboardEvent("keydown", { altKey: true, key: "d" });
        const keyEvent3 = new KeyboardEvent("keydown", { metaKey: true, key: "p" });
        const testFunc = vi.fn(async () => {
            return;
        });
        const command = await commandRegistry.registerCommand(
            "fo.test.command",
            testFunc
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.Core,
                "ctrl+s, alt+d, meta+p",
                "fo.test.command"
            );
        }).not.toThrow();
        await keyManager.handleKeyDown(keyEvent1);
        expect(testFunc).toHaveBeenCalledTimes(0);
        await keyManager.handleKeyDown(keyEvent2);
        expect(testFunc).toHaveBeenCalledTimes(0);
        await keyManager.handleKeyDown(keyEvent3);
        expect(testFunc).toHaveBeenCalledTimes(1);
    });
    it("can invoke a command binding with multiple sequences with overlapped bindings in multiple scopes", async () => {
        const keyEvent1 = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const keyEvent2 = new KeyboardEvent("keydown", { altKey: true, key: "d" });
        const keyEvent3 = new KeyboardEvent("keydown", { altKey: true, key: "x" });
        const testFunc1 = vi.fn(async () => {
            return;
        });
        const testFunc2 = vi.fn(async () => {
            return;
        });
        const command1 = await commandRegistry.registerCommand(
            "fo.test.command1",
            testFunc1
        );
        expect(command1).toBeDefined();
        const command2 = await commandRegistry.registerCommand(
            "fo.test.command2",
            testFunc2
        );
        expect(command2).toBeDefined();
        //The start sequence ctrl+s is the same for both commands, one is User the other Core
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.Core,
                "ctrl+s, alt+d",
                "fo.test.command1"
            );
        }).not.toThrow();
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.User,
                "ctrl+s, alt+x",
                "fo.test.command2"
            );
        }).not.toThrow();
        await keyManager.handleKeyDown(keyEvent1);
        expect(testFunc1).toHaveBeenCalledTimes(0);
        expect(testFunc2).toHaveBeenCalledTimes(0);
        await keyManager.handleKeyDown(keyEvent2);
        expect(testFunc1).toHaveBeenCalledTimes(1);
        expect(testFunc2).toHaveBeenCalledTimes(0);
        //The command is executed, make sure it has cleared the first match and cannot invoke the 2nd command
        await keyManager.handleKeyDown(keyEvent3);
        expect(testFunc1).toHaveBeenCalledTimes(1);
        expect(testFunc2).toHaveBeenCalledTimes(0);
    });

    it("properly terminates a key sequence", async () => {
        //full sequence:
        //ctrl+s, q, alt+d, q, ctrl+s, alt+d (fires command)
        const keyEvent1 = new KeyboardEvent("keydown", { ctrlKey: true, key: "s" });
        const keyEvent2 = new KeyboardEvent("keydown", { altKey: true, key: "d" });
        const badEvent = new KeyboardEvent("keydown", { key: "q" });
        const testFunc = vi.fn(async () => {
            return;
        });
        const command = await commandRegistry.registerCommand(
            "fo.test.command",
            testFunc
        );
        expect(command).toBeDefined();
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.Core,
                "ctrl+s, alt+d",
                "fo.test.command"
            );
        }).not.toThrow();
        //first event matches ctrl+s, but does not invoke the command
        await keyManager.handleKeyDown(keyEvent1);
        expect(testFunc).toHaveBeenCalledTimes(0);
        //send a non-matching event
        await keyManager.handleKeyDown(badEvent);
        expect(testFunc).toHaveBeenCalledTimes(0);
        //now send the 2nd matching sequence alt+d
        await keyManager.handleKeyDown(keyEvent2);
        //make sure it is not invoked
        expect(testFunc).toHaveBeenCalledTimes(0);
        //send a non-matching event to clear the alt+d
        await keyManager.handleKeyDown(badEvent);
        expect(testFunc).toHaveBeenCalledTimes(0);
        //send the matching sequence and make sure it fires
        await keyManager.handleKeyDown(keyEvent1);
        expect(testFunc).toHaveBeenCalledTimes(0);
        await keyManager.handleKeyDown(keyEvent2);
        expect(testFunc).toHaveBeenCalledTimes(1);
    });

    it("will not register the same binding in the same scope", async () => {
        const command1 = await commandRegistry.registerCommand(
            "fo.test.command1",
            async () => { return; }
        );
        expect(command1).toBeDefined();
        const command2 = await commandRegistry.registerCommand(
            "fo.test.command2",
            async () => { return; }
        );
        const binding = "ctrl+s, alt+d";
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.Core,
                binding,
                "fo.test.command1"
            );
        }).not.toThrow();
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.Core,
                binding,
                "fo.test.command2"
            );
        }).toThrowError(`The binding ${binding} is already bound in the ${KeyBindingScope.Core} scope`)
        expect(command2).toBeDefined();
    });
    it("will register the same binding in the different scopes (shadowing)", async () => {
        const command1 = await commandRegistry.registerCommand(
            "fo.test.command1",
            async () => { return; }
        );
        expect(command1).toBeDefined();
        const command2 = await commandRegistry.registerCommand(
            "fo.test.command2",
            async () => { return; }
        );
        expect(command2).toBeDefined();
        const binding = "ctrl+s, alt+d";
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.Core,
                binding,
                "fo.test.command1"
            );
        }).not.toThrow();
        expect(() => {
            keyManager.bindKey(
                KeyBindingScope.User,
                binding,
                "fo.test.command2"
            );
        }).not.toThrow();

    });
});
