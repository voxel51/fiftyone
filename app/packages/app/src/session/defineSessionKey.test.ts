/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";

import { EVENTS } from "../useEvents/registerEvent";
import { REGISTERED_SETTERS } from "../useSetters/registerSetter";
import { REGISTERED_WRITERS } from "../useWriters/registerWriter";
import { sessionKeys } from "./defineSessionKey";
import "../useEvents";
import "../useSetters";
import "../useWriters";
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

  it("keeps every registration the three registries had", () => {
    // The set before the three registries were folded into one, plus the
    // streamed app count, a message like state_update rather than a field. A
    // field that silently stops being registered is the failure this catches.
    expect(new Set(Object.keys(EVENTS))).toEqual(
      new Set([
        "app_count_update",
        "deactivate_notebook_cell",
        "refresh",
        "select_labels",
        "select_samples",
        "set_color_scheme",
        "set_field_visibility_stage",
        "set_group_slice",
        "set_label_selection_style",
        "set_sample",
        "set_sample_selection_style",
        "set_spaces",
        "state_update",
      ]),
    );

    expect(new Set(REGISTERED_SETTERS.keys())).toEqual(
      new Set([
        "colorScheme",
        "datasetName",
        "fieldVisibilityStage",
        "refresh",
        "similarityParameters",
        "view",
        "viewName",
      ]),
    );

    expect(new Set(Object.keys(REGISTERED_WRITERS))).toEqual(
      new Set([
        "labelSelectionStyle",
        "modalFilters",
        "modalSelector",
        "sampleSelectionStyle",
        "selectedLabels",
        "selectedSamples",
        "sessionGroupSlice",
        "sessionSpaces",
      ]),
    );
  });

  it("names the server's message when it handles one", () => {
    for (const field of sessionKeys()) {
      if (field.fromServer) {
        expect(field.event).toBeTruthy();
      }
    }
  });
});
