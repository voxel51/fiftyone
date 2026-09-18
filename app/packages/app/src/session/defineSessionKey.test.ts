/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";

import { EVENTS } from "../useEvents/registerEvent";
import { REGISTERED_SETTERS } from "../useSetters/registerSetter";
import { REGISTERED_WRITERS } from "../useWriters/registerWriter";
import { sessionKeys } from "./defineSessionKey";
import "./index";

describe("defined session fields", () => {
  it("reach the registries their hooks read", () => {
    const defined = sessionKeys();
    expect(defined.length).toBeGreaterThan(0);

    for (const field of defined) {
      if (field.fromServer) {
        // Registration snake-cases the wire name.
        const wire = field.event?.replace(
          /[A-Z]/g,
          (letter) => `_${letter.toLowerCase()}`,
        );
        expect(wire && EVENTS[wire]).toBeTruthy();
      }

      if (field.onWrite) {
        expect(REGISTERED_SETTERS.get(field.key)).toBeTruthy();
      }

      if (field.onWritten) {
        expect(REGISTERED_WRITERS[field.key]).toBeTruthy();
      }
    }
  });

  it("names the server's message when it handles one", () => {
    for (const field of sessionKeys()) {
      if (field.fromServer) {
        expect(field.event).toBeTruthy();
      }
    }
  });
});
