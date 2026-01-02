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

/**
 * Manages a set of key bindings in a context.
 * Each context must contain unique bindings.  
 * @see KeyParser for documentation on the binding format.
 */
export class KeyManager {
  private bindings = new Map<Array<KeySequence>, Command>();
  private priorMatches = new Array<KeyboardEvent>();
  /**
   * @param commandRegistry For testing we want a local command registry.
   * If not provided it will use the global one.
   */
  constructor(private readonly commandRegistry: CommandRegistry) {
  }

  /**
   * Process the event against current bindings.  
   * @param event The key event
   * @returns A match state which tells if it is a partial match, or a full match, or none.
   */
  public match(
    event: KeyboardEvent,
  ): KeyMatchState {
    let state: KeyMatchState = {
      partial: false,
    }
    let hasMatch = false;
    let command: Command | undefined = undefined;
    for (const [sequences, cmd] of this.bindings) {
      if(command){
        break;
      }
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
   * Checks if a binding is bound in a particular scope
   * @param bindings The scope to check in
   * @param test The sequences to check for
   * @returns true if it is, false if not
   */
  private isKeyBound(
    test: Array<KeySequence>
  ): boolean {
    return (
      [...this.bindings.keys()].find((sequences) => {
        if (sequences.length !== test.length) {
          return false;
        }
        for (let i = 0; i < sequences.length; i++) {
          if (!sequences[i].equals(test[i])) {
            return false;
          }
        }
        return true;
      }) !== undefined
    );
  }
  /**
   * @see KeyParser for documentation of the sequence specification
   * @param sequence The sequence, ie "ctrl+shift+F12"
   * @param commandId A previously registered command id. @see CommandRegistry
   */
  public bindKey(sequence: string, commandId: string) {
    const keySequences = KeyParser.parseBinding(sequence);
    const command = this.commandRegistry.getCommand(commandId);
    if (!command) {
      throw new Error(
        `The command id ${commandId} is not registered for binding ${sequence}`
      );
    }
    if (this.isKeyBound(keySequences)) {
      throw new Error(
        `The binding ${sequence} is already bound in this context`
      );
    }
    this.bindings.set(keySequences, command);
  }

  public resetKeyState(){
    this.priorMatches = [];
  }
}

