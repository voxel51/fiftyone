/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { CommandDispatcher } from "./dispatch/dispatcher";
import { getCommandBus } from "./dispatch/registry";
import { Command } from "./types";

/**
 * Example command: Persist data with a label
 */
export class PersistCommand extends Command<{ success: boolean }> {
  constructor(public readonly label: string) {
    super();
  }
}

/**
 * Example command: Create a user
 */
export class CreateUserCommand extends Command<{ id: string }> {
  constructor(
    public readonly email: string,
    public readonly displayName: string
  ) {
    super();
  }
}

/**
 * Example command: Delete a user
 */
export class DeleteUserCommand extends Command<void> {
  constructor(public readonly userId: string) {
    super();
  }
}

/**
 * Register handlers for demo commands.
 * In a real application, this would be done in the composition root.
 */
export function registerDemoHandlers(bus: CommandDispatcher) {
  // Register PersistCommand handler
  bus.register(PersistCommand, async (cmd) => {
    console.log(`Persisting data with label: ${cmd.label}`);
    // Simulate async work
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { success: true };
  });

  // Register CreateUserCommand handler
  bus.register(CreateUserCommand, async (cmd) => {
    console.log(`Creating user: ${cmd.email} (${cmd.displayName})`);
    // Simulate creating user and returning ID
    await new Promise((resolve) => setTimeout(resolve, 100));
    const id = `user-${Math.random().toString(36).substr(2, 9)}`;
    return { id };
  });

  // Register DeleteUserCommand handler
  bus.register(DeleteUserCommand, async (cmd) => {
    console.log(`Deleting user: ${cmd.userId}`);
    // Simulate async deletion
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Returns void (no result)
  });
}

/**
 * Demo function showing command system usage.
 */
export async function runDemo() {
  console.log("=== Command System Demo ===\n");

  // Get the command bus (typically done once at app startup)
  const bus = getCommandBus();

  // Register handlers (typically done in composition root)
  registerDemoHandlers(bus);

  console.log("--- Executing PersistCommand ---");
  const persistResult = await bus.execute(new PersistCommand("myLabel"));
  console.log("Result:", persistResult);
  // Result: { success: true }

  console.log("\n--- Executing CreateUserCommand ---");
  const createResult = await bus.execute(
    new CreateUserCommand("user@example.com", "John Doe")
  );
  console.log("Result:", createResult);
  // Result: { id: string }

  console.log("\n--- Executing DeleteUserCommand ---");
  const deleteResult = await bus.execute(
    new DeleteUserCommand(createResult.id)
  );
  console.log("Result:", deleteResult);
  // Result: undefined (void)

  console.log("\n--- Demonstrating error handling ---");
  try {
    // This should throw because no handler is registered
    class UnregisteredCommand extends Command<void> {}
    await bus.execute(new UnregisteredCommand());
  } catch (error) {
    console.error("Error:", (error as Error).message);
    // Error: No handler registered for UnregisteredCommand
  }

  console.log("\n--- Demonstrating duplicate registration prevention ---");
  try {
    // This should throw because handler is already registered
    bus.register(PersistCommand, async (cmd) => {
      return { success: false };
    });
  } catch (error) {
    console.error("Error:", (error as Error).message);
    // Error: Handler already registered for PersistCommand
  }

  console.log("\n=== Demo Complete ===");
}
