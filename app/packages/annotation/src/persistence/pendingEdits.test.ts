import { beforeEach, describe, expect, it } from "vitest";
import type { LabelFieldDelta } from "../deltas";
import { PendingEdits } from "./pendingEdits";

const det = (label: string, extra: Record<string, unknown> = {}) => ({
  _id: "det-1",
  _cls: "Detection",
  label,
  ...extra,
});

const delta = (
  previousValue: unknown,
  newValue: unknown,
  overrides: Partial<LabelFieldDelta> = {}
): LabelFieldDelta => ({
  field: "ground_truth",
  listKey: "detections",
  labelId: "det-1",
  previousValue,
  newValue,
  ...overrides,
});

describe("PendingEdits", () => {
  let edits: PendingEdits;

  beforeEach(() => {
    edits = new PendingEdits();
  });

  describe("record + take (consolidation)", () => {
    it("takes the net original → latest change for one edit", () => {
      edits.record("s1", delta(null, det("cat")));

      const taken = edits.take("s1");

      expect(taken).toEqual([delta(null, det("cat"))]);
    });

    it("nets any number of edits to one delta with the FIRST original", () => {
      edits.record("s1", delta(det("cat"), det("dog")));
      edits.record("s1", delta(det("dog"), det("bird")));
      edits.record("s1", delta(det("bird"), det("eagle")));

      const taken = edits.take("s1");

      expect(taken).toHaveLength(1);
      expect(taken[0].previousValue).toEqual(det("cat"));
      expect(taken[0].newValue).toEqual(det("eagle"));
    });

    it("resolves an edit moved back to its starting value (no request)", () => {
      edits.record("s1", delta(det("cat"), det("dog")));
      edits.record("s1", delta(det("dog"), det("cat")));

      expect(edits.take("s1")).toEqual([]);
      expect(edits.sampleIds()).toEqual([]);
    });

    it("resolves an add that was deleted before ever being saved", () => {
      edits.record("s1", delta(null, det("cat")));
      edits.record("s1", delta(det("cat"), null));

      expect(edits.take("s1")).toEqual([]);
    });

    it("ignores key-order and formatting differences when resolving", () => {
      // Overlay representations may differ only by key order — that must not
      // register as a change and trigger a phantom save.
      edits.record(
        "s1",
        delta(
          { _id: "det-1", label: "cat", confidence: 0.5 },
          { confidence: 0.5, label: "cat", _id: "det-1" }
        )
      );

      expect(edits.take("s1")).toEqual([]);
    });

    it("tracks labels and fields independently", () => {
      edits.record("s1", delta(null, det("cat")));
      edits.record(
        "s1",
        delta(null, { _id: "det-2", label: "dog" }, { labelId: "det-2" })
      );
      edits.record(
        "s1",
        delta("old", "new", { field: "notes", listKey: null, labelId: null })
      );

      expect(edits.take("s1")).toHaveLength(3);
    });
  });

  describe("ackApplied", () => {
    it("resolves the entry when nothing changed mid-flight", () => {
      edits.record("s1", delta(null, det("cat")));
      const [flushed] = edits.take("s1");

      edits.ackApplied("s1", flushed);

      expect(edits.take("s1")).toEqual([]);
      expect(edits.sampleIds()).toEqual([]);
    });

    it("advances the original for an edit made while the save was on the wire", () => {
      edits.record("s1", delta(null, det("cat")));
      const [flushed] = edits.take("s1");

      // User keeps editing while the request is in flight.
      edits.record("s1", delta(det("cat"), det("dog")));
      edits.ackApplied("s1", flushed);

      // The next flush sends the remaining net change on top of what the
      // server now holds — the precondition is the saved value, never a
      // stale render snapshot.
      const taken = edits.take("s1");
      expect(taken).toHaveLength(1);
      expect(taken[0].previousValue).toEqual(det("cat"));
      expect(taken[0].newValue).toEqual(det("dog"));
    });

    it("re-takes the same delta after a flush that never acked (lost response)", () => {
      edits.record("s1", delta(null, det("cat")));
      const first = edits.take("s1");
      // No ack (network failure) — the retry must send the identical net
      // change so the server can resolve it idempotently.
      const second = edits.take("s1");

      expect(second).toEqual(first);
    });
  });

  describe("ackConflict", () => {
    const serverDocument = {
      _id: "s1",
      ground_truth: {
        _cls: "Detections",
        detections: [det("changed_by_other")],
      },
    };

    it("rebases the original from the server's reported state", () => {
      edits.record("s1", delta(det("cat"), det("dog")));
      const [flushed] = edits.take("s1");

      edits.ackConflict("s1", flushed, serverDocument);

      const taken = edits.take("s1");
      expect(taken).toHaveLength(1);
      // Retry preconditions on what the server actually holds.
      expect(taken[0].previousValue).toEqual(det("changed_by_other"));
      expect(taken[0].newValue).toEqual(det("dog"));
    });

    it("resolves when the server already holds the user's latest", () => {
      edits.record("s1", delta(det("cat"), det("changed_by_other")));
      const [flushed] = edits.take("s1");

      edits.ackConflict("s1", flushed, serverDocument);

      expect(edits.take("s1")).toEqual([]);
    });

    it("rebases to an add when the label is gone from the server", () => {
      edits.record("s1", delta(det("cat"), det("dog")));
      const [flushed] = edits.take("s1");

      edits.ackConflict("s1", flushed, {
        _id: "s1",
        ground_truth: { _cls: "Detections", detections: [] },
      });

      const taken = edits.take("s1");
      expect(taken[0].previousValue).toBeNull();
      expect(taken[0].newValue).toEqual(det("dog"));
    });
  });

  describe("multi-sample isolation", () => {
    it("takes only the requested sample's deltas", () => {
      edits.record("s1", delta(null, det("cat")));
      edits.record("s2", delta(null, det("dog")));

      expect(edits.sampleIds().sort()).toEqual(["s1", "s2"]);
      expect(edits.take("s1")).toHaveLength(1);
      // s2 untouched by s1's flush — edits made before navigating away are
      // never stranded.
      expect(edits.take("s2")).toHaveLength(1);
    });
  });

  describe("pendingDeltas", () => {
    it("reads without flush bookkeeping or resolution", () => {
      edits.record("s1", delta(det("cat"), det("dog")));

      const pending = edits.pendingDeltas("s1");
      expect(pending).toHaveLength(1);
      expect(pending[0].newValue).toEqual(det("dog"));

      // Still takeable afterwards — pendingDeltas must not consume.
      expect(edits.take("s1")).toHaveLength(1);
    });
  });
});
