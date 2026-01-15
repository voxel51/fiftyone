/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import React, { useCallback, useRef, useState } from "react";
import { useCommandBus, useRegisterCommandHandler } from "./hooks";
import { Command } from "./types";

/**
 * Example commands for the demo
 */
export class CreateUserCommand extends Command<{ id: string; email: string }> {
  constructor(
    public readonly email: string,
    public readonly displayName: string
  ) {
    super();
  }
}

export class DeleteUserCommand extends Command<void> {
  constructor(public readonly userId: string) {
    super();
  }
}

export class FetchUserCommand extends Command<{
  id: string;
  name: string;
  email: string;
}> {
  constructor(public readonly userId: string) {
    super();
  }
}

export class IncrementCounterCommand extends Command<{ newValue: number }> {
  constructor(public readonly amount: number) {
    super();
  }
}

export class ToggleFeatureCommand extends Command<{ enabled: boolean }> {
  constructor(public readonly featureName: string) {
    super();
  }
}

/**
 * Demo component showcasing the command system in React
 */
export const Demo = () => {
  const bus = useCommandBus();
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastUserId, setLastUserId] = useState<string>("");

  // Shared state for handlers (simulating repository)
  const userIdCounterRef = useRef(0);
  const usersRef = useRef(
    new Map<string, { id: string; name: string; email: string }>()
  );
  const counterRef = useRef(0);

  // Register CreateUserCommand handler
  useRegisterCommandHandler(
    CreateUserCommand,
    useCallback(async (cmd) => {
      console.log(`Creating user: ${cmd.email} (${cmd.displayName})`);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const id = `user-${++userIdCounterRef.current}`;
      const user = { id, name: cmd.displayName, email: cmd.email };
      usersRef.current.set(id, user);

      return { id, email: cmd.email };
    }, [])
  );

  // Register DeleteUserCommand handler
  useRegisterCommandHandler(
    DeleteUserCommand,
    useCallback(async (cmd) => {
      console.log(`Deleting user: ${cmd.userId}`);
      await new Promise((resolve) => setTimeout(resolve, 300));

      usersRef.current.delete(cmd.userId);
      // Returns void
    }, [])
  );

  // Register FetchUserCommand handler
  useRegisterCommandHandler(
    FetchUserCommand,
    useCallback(async (cmd) => {
      console.log(`Fetching user: ${cmd.userId}`);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const user = usersRef.current.get(cmd.userId);
      if (!user) {
        throw new Error(`User not found: ${cmd.userId}`);
      }
      return user;
    }, [])
  );

  // Register IncrementCounterCommand handler
  useRegisterCommandHandler(
    IncrementCounterCommand,
    useCallback(async (cmd) => {
      console.log(`Incrementing counter by: ${cmd.amount}`);
      await new Promise((resolve) => setTimeout(resolve, 100));

      counterRef.current += cmd.amount;
      return { newValue: counterRef.current };
    }, [])
  );

  // Register ToggleFeatureCommand handler
  useRegisterCommandHandler(
    ToggleFeatureCommand,
    useCallback(async (cmd) => {
      console.log(`Toggling feature: ${cmd.featureName}`);
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Simulate feature toggle logic
      const enabled = Math.random() > 0.5;
      return { enabled };
    }, [])
  );

  const handleCreateUser = async () => {
    setLoading(true);
    setStatus("Creating user...");
    try {
      const result = await bus.execute(
        new CreateUserCommand("user@example.com", "John Doe")
      );
      setStatus(`User created: ${result.id} (${result.email})`);
      setLastUserId(result.id);
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchUser = async () => {
    if (!lastUserId) {
      setStatus("Create a user first");
      return;
    }

    setLoading(true);
    setStatus("Fetching user...");
    try {
      const result = await bus.execute(new FetchUserCommand(lastUserId));
      setStatus(`User fetched: ${result.name} (${result.email})`);
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!lastUserId) {
      setStatus("Create a user first");
      return;
    }

    setLoading(true);
    setStatus("Deleting user...");
    try {
      await bus.execute(new DeleteUserCommand(lastUserId));
      setStatus(`User deleted: ${lastUserId}`);
      setLastUserId("");
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleIncrementCounter = async () => {
    setLoading(true);
    setStatus("Incrementing counter...");
    try {
      const result = await bus.execute(new IncrementCounterCommand(5));
      setStatus(`Counter value: ${result.newValue}`);
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFeature = async () => {
    setLoading(true);
    setStatus("Toggling feature...");
    try {
      const result = await bus.execute(new ToggleFeatureCommand("dark-mode"));
      setStatus(`Feature toggled: ${result.enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Command System Demo</h2>
      <div>
        <button onClick={handleCreateUser} disabled={loading}>
          Create User
        </button>
        <button onClick={handleFetchUser} disabled={loading || !lastUserId}>
          Fetch User
        </button>
        <button onClick={handleDeleteUser} disabled={loading || !lastUserId}>
          Delete User
        </button>
        <button onClick={handleIncrementCounter} disabled={loading}>
          Increment Counter
        </button>
        <button onClick={handleToggleFeature} disabled={loading}>
          Toggle Feature
        </button>
      </div>

      <div>
        <p>Open the browser console to see command execution logs.</p>
        <p>Last User ID: {lastUserId || "None"}</p>
      </div>
    </div>
  );
};
