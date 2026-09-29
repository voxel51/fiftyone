/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { render, screen } from "@testing-library/react";
import type { IEnvironment } from "relay-runtime";
import { describe, expect, it } from "vitest";
import {
  EnvironmentKey,
  ReverbRelayEnvironment,
  ReverbRelayEnvironmentProvider,
  registerEnvironment,
  resolveEnvironment,
} from "./ReverbRelayEnvironment";

const fake = (name: string) => ({ name }) as unknown as IEnvironment;

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("EnvironmentKey", () => {
  it("names itself for a message", () => {
    expect(new EnvironmentKey("relay").toJSON()).toBe("relay");
  });

  it("throws until an environment is registered", () => {
    expect(() => resolveEnvironment(new EnvironmentKey("absent"))).toThrow(
      /must register an environment/,
    );
  });

  it("passes an environment through untouched", () => {
    const environment = fake("direct");

    expect(resolveEnvironment(environment)).toBe(environment);
  });

  it("resolves a registered environment", () => {
    const key = new EnvironmentKey("registered");
    const environment = fake("registered");
    registerEnvironment(environment, key);

    expect(resolveEnvironment(key)).toBe(environment);
  });

  it("refuses a second environment for one key", () => {
    const key = new EnvironmentKey("conflict");
    registerEnvironment(fake("first"), key);

    expect(() => registerEnvironment(fake("second"), key)).toThrow(
      /one Relay environment per EnvironmentKey/,
    );
  });

  it("defers cleanup past the turn that re-registers", async () => {
    const key = new EnvironmentKey("deferred");
    const environment = fake("deferred");
    const dispose = registerEnvironment(environment, key);

    dispose();
    expect(resolveEnvironment(key)).toBe(environment);

    registerEnvironment(environment, key);
    await settled();

    expect(resolveEnvironment(key)).toBe(environment);
  });

  it("releases a key once the deferred cleanup runs", async () => {
    const key = new EnvironmentKey("released");
    const dispose = registerEnvironment(fake("released"), key);

    dispose();
    await settled();

    expect(() => resolveEnvironment(key)).toThrow(
      /must register an environment/,
    );
  });
});

describe("ReverbRelayEnvironment", () => {
  it("registers during render, before a descendant effect runs", () => {
    const key = new EnvironmentKey("rendered");
    const environment = fake("rendered");
    let resolvedDuringRender: IEnvironment | undefined;

    const Child = () => {
      resolvedDuringRender = resolveEnvironment(key);

      return <span>child</span>;
    };

    render(
      <ReverbRelayEnvironment environment={environment} environmentKey={key}>
        <Child />
      </ReverbRelayEnvironment>,
    );

    expect(resolvedDuringRender).toBe(environment);
    expect(screen.getByText("child")).toBeTruthy();
  });

  it("provides the environment to Relay as well", () => {
    const key = new EnvironmentKey("provided");
    const environment = fake("provided");

    render(
      <ReverbRelayEnvironmentProvider
        environment={environment}
        environmentKey={key}
      >
        <span>provided</span>
      </ReverbRelayEnvironmentProvider>,
    );

    expect(resolveEnvironment(key)).toBe(environment);
    expect(screen.getByText("provided")).toBeTruthy();
  });
});
