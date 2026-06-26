/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Command } from "../types";
import { KeySequence, KeyParser } from "./KeyParser";
import { CommandRegistry } from "../registry";

export type KeyMatchState = {
  partial: boolean;
  full?: Command;
};

type KeyBindingEntry = {
  command: Command;
  priority: number;
  order: number;
};

/**
 * Manages a set of key bindings in a context.
 * Duplicate bindings are allowed; the highest-priority enabled command wins.
 * @see KeyParser for documentation on the binding format.
 */
export class KeyManager {
  private bindings = new Map<string, KeyBindingEntry[]>();
  private priorMatches = new Array<KeyboardEvent>();
  private bindingOrder = 0;
  /**
   * @param commandRegistry For testing we want a local command registry.
   * If not provided it will use the global one.
   */
  constructor(private readonly commandRegistry: CommandRegistry) {}

  /**
   * Process the event against current bindings.
   * @param event The key event
   * @returns A match state which tells if it is a partial match, or a full match, or none.
   */
  public match(event: KeyboardEvent): KeyMatchState {
    const state: KeyMatchState = {
      partial: false,
    };
    let hasMatch = false;
    let command: Command | undefined = undefined;
    for (const [binding, commands] of this.bindings) {
      if (command) {
        break;
      }
      const sequences = KeyParser.parseBinding(binding);
      for (const [index, sequence] of sequences.entries()) {
        //Match to prior matches for the begining if there are any
        if (index < this.priorMatches.length) {
          if (!sequence.matches(this.priorMatches[index])) {
            break;
          }
        } else {
          //now match this event, since possible prior matches match
          if (sequence.matches(event)) {
            //If there are no more sequences to match, return the command
            if (index === sequences.length - 1) {
              command = commands.find(({ command: cmd }) =>
                cmd.isEnabled(),
              )?.command;
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
    if (state.full || !hasMatch) {
      this.priorMatches = [];
      return state;
    }
    if (hasMatch) {
      //It matched a sequence, but not the full binding
      state.partial = true;
      this.priorMatches.push(event);
    }
    return state;
  }

  /**
   * @returns true if there is a multi sequence active, ie
   * ctrl+x, ctrl+z, when ctrl+x has already matched.
   */
  public multiSequenceInProgress(): boolean {
    return this.priorMatches.length > 0;
  }
  /**
   * @see KeyParser for documentation of the sequence specification
   * @param sequence The sequence, ie "ctrl+shift+F12"
   * @param commandId A previously registered command id. @see CommandRegistry
   */
  public bindKey(sequence: string, commandId: string, priority = 0) {
    const keySequences = KeyParser.parseBinding(sequence);
    const command = this.commandRegistry.getCommand(commandId);
    if (!command) {
      throw new Error(
        `The command id ${commandId} is not registered for binding ${sequence}`,
      );
    }

    const binding = this.normalizeBinding(keySequences);
    const commands = this.bindings.get(binding) ?? [];
    this.bindings.set(
      binding,
      [
        ...commands,
        {
          command,
          priority,
          order: this.bindingOrder++,
        },
      ].sort((a, b) => b.priority - a.priority || b.order - a.order),
    );
  }

  private normalizeBinding(sequences: KeySequence[]) {
    const strings = new Array<string>();
    sequences.forEach((sequence) => {
      strings.push(sequence.toString());
    });
    return strings.join(",");
  }

  public unbindKey(sequence: string, commandId?: string) {
    const binding = this.normalizeBinding(KeyParser.parseBinding(sequence));

    if (!commandId) {
      this.bindings.delete(binding);
      return;
    }

    const commands = this.bindings.get(binding);
    if (!commands) {
      return;
    }

    const remainingCommands = commands.filter(
      ({ command }) => command.id !== commandId,
    );
    if (remainingCommands.length === 0) {
      this.bindings.delete(binding);
    } else {
      this.bindings.set(binding, remainingCommands);
    }
  }

  public resetKeyState() {
    this.priorMatches = [];
  }
}
