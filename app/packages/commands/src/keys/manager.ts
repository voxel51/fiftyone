/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Command } from "../types";
import { KeySequence, KeyParser } from "./parser";
import { CommandRegistry, getCommandRegistry } from "../registry";

export enum KeyBindingScope {
  User = "User",
  Plugin = "Plugin",
  Core = "Core",
}

type MatchState = {
  partial: boolean;
  full?: Command;
};

/**
 * Manages a set of key bindings in scopes.
 * Each scope must contain unique bindings.  
 * Scopes may shadow bindings in other scopes with the 
 * precedence being User, Plugin, Core.
 * This allows plugins and user re-bindings.
 * @see KeyParser for documentation on the binding format.
 */
export class KeyManager {
  private userBindings = new Map<Array<KeySequence>, Command>();
  private pluginBindings = new Map<Array<KeySequence>, Command>();
  private coreBindings = new Map<Array<KeySequence>, Command>();
  private priorMatches = new Array<KeyboardEvent>();
  private readonly commandRegistry: CommandRegistry;
  /**
   * @param commandRegistry For testing we want a local command registry.
   * If not provided it will use the global one.
   */
  constructor(commandRegistry?: CommandRegistry) {
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    if (commandRegistry) {
      this.commandRegistry = commandRegistry;
    } else {
      this.commandRegistry = getCommandRegistry();
    }
  }
  /**
   * @param bindings The scope to handle the key in
   * @param event The key event
   * @returns
   */
  private async scopedHandle(
    bindings: Map<Array<KeySequence>, Command>,
    event: KeyboardEvent,
    state: MatchState
  ): Promise<void> {
    let hasMatch = false;
    let command: Command | undefined = undefined;
    for (const [sequences, cmd] of bindings) {
      //run through the bindings
      for (const [index, sequence] of sequences.entries()) {
        //Match to prior matches for the begining if there are any
        if (index < this.priorMatches.length) {
          if (!sequence.matches(this.priorMatches[index])) {
            continue;
          }
        } else {
          //now match this event, since possible prior matches match
          if (sequence.matches(event)) {
            //If there are no more sequences to match, return the command
            if (index === sequences.length - 1) {
              command = cmd;
              break;
            }
            //Matches a subset of the sequences. Mark the match so we can add the event to prior matches
            hasMatch = true;
          } else {
            break;
          }
        }
      }
    }
    state.full = command;
    //Keep the state of any partial matches from other scopes
    if (!state.partial) {
      state.partial = hasMatch;
    }
  }

  /**
   * @returns true if there is a multi sequence active, ie
   * ctrl+x, ctrl+z, when ctrl+x has already matched.
   */
  public multiSequenceInProgress(): boolean {
    return this.priorMatches.length === 0;
  }
  /**
   * Updates internal state based on the result of a scoped match result.
   * @param match A match result
   * @returns true is the match should be considered handled (no further processing required)
   */
  private async processMatch(match: MatchState): Promise<boolean> {
    if (match.full) {
      await match.full.execute();
      this.priorMatches = [];
      return true;
    }
    return false;
  }
  /**
   * Key down handling.  Public only for testing.
   * @param event Key event
   */
  public async handleKeyDown(event: KeyboardEvent) {
    const state: MatchState = {
      partial: false,
    };
    await this.scopedHandle(this.userBindings, event, state);
    if (await this.processMatch(state)) {
      return;
    }
    await this.scopedHandle(this.pluginBindings, event, state);
    if (await this.processMatch(state)) {
      return;
    }
    await this.scopedHandle(this.coreBindings, event, state);
    if (await this.processMatch(state)) {
      return;
    }
    if (state.partial) {
      //It matched a sequence, but not the full binding
      this.priorMatches.push(event);
    } else {
      //No match, clear any previous sequence matches
      this.priorMatches = [];
    }
  }
  /**
   * Checks if a binding is bound in a particular scope
   * @param bindings The scope to check in
   * @param test The sequences to check for
   * @returns true if it is, false if not
   */
  private isKeyBound(
    bindings: Map<Array<KeySequence>, Command>,
    test: Array<KeySequence>
  ): boolean {
    return (
      bindings.keys().find((sequences) => {
        if (sequences.length !== test.length) {
          return false;
        }
        for (let i = 0; i < sequences.length; i++) {
          if (sequences[i].equals(test[i]) && i == sequences.length - 1) {
            return true;
          }
        }
        return false;
      }) !== undefined
    );
  }
  /**
   * @see KeyManager for documentation of the sequence specification
   * @param scope The binding scope
   * @param sequence The sequence, ie "strl+shift+F12"
   * @param commandId A previously registered command id. @see CommandRegistry
   */
  public bindKey(scope: KeyBindingScope, sequence: string, commandId: string) {
    const keySequences = KeyParser.parseBinding(sequence);
    const command = this.commandRegistry.getCommand(commandId);
    if (!command) {
      throw new Error(
        `The command id ${commandId} is not registered for binding ${sequence}`
      );
    }
    switch (scope) {
      case KeyBindingScope.Core:
        if (this.isKeyBound(this.coreBindings, keySequences)) {
          throw new Error(
            `The binding ${sequence} is already bound in the ${scope} scope`
          );
        }
        this.coreBindings.set(keySequences, command);
        break;
      case KeyBindingScope.Plugin:
        if (this.isKeyBound(this.pluginBindings, keySequences)) {
          throw new Error(
            `The binding ${sequence} is already bound in the ${scope} scope`
          );
        }
        this.pluginBindings.set(keySequences, command);
        break;
      case KeyBindingScope.User:
        if (this.isKeyBound(this.userBindings, keySequences)) {
          throw new Error(
            `The binding ${sequence} is already bound in the ${scope} scope`
          );
        }
        this.userBindings.set(keySequences, command);
        break;
    }
  }
}
//global
const keyManager = new KeyManager();

export function getKeyManager(): KeyManager {
  return keyManager;
}
