import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchImpl = vi.fn();

vi.mock("@fiftyone/utilities", async (importActual) => {
  const actual = await importActual<typeof import("@fiftyone/utilities")>();
  return { ...actual, getFetchFunctionExtended: () => fetchImpl };
});

import {
  saveAnnotationFieldUpdates,
  SaveConflictError,
} from "./annotationClient";

// A valid 24-char ObjectId hex string.
const OID = "0123456789abcdef01234567";

describe("saveAnnotationFieldUpdates", () => {
  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it("PATCHes the batch to the /fields route as extended JSON", async () => {
    let captured: Record<string, unknown> | undefined;
    fetchImpl.mockImplementation(async (config: Record<string, unknown>) => {
      captured = config;
      return { response: undefined };
    });

    await saveAnnotationFieldUpdates("ds1", "s1", [
      {
        collection: "samples.ds1",
        id: "s1",
        lookupPath: "ground_truth.detections",
        labelId: "det-1",
        previousValue: { _id: OID, label: "cat" },
        newValue: { _id: OID, label: "dog" },
      },
    ]);

    expect(captured?.method).toBe("PATCH");
    expect(String(captured?.path)).toContain("dataset/ds1/sample/s1/fields");

    const body = captured?.body as Record<string, unknown>[];
    expect(body[0].collection).toBe("samples.ds1");
    expect(body[0].labelId).toBe("det-1");
    // nested ObjectId hex round-trips to MongoDB extended JSON
    expect((body[0].previousValue as { _id: unknown })._id).toEqual({
      $oid: OID,
    });
    expect((body[0].newValue as { label: string }).label).toBe("dog");
  });

  it("no-ops on an empty batch", async () => {
    await saveAnnotationFieldUpdates("ds1", "s1", []);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes through datasetName and op without value fields", async () => {
    let captured: Record<string, unknown> | undefined;
    fetchImpl.mockImplementation(async (config: Record<string, unknown>) => {
      captured = config;
      return { response: undefined };
    });

    await saveAnnotationFieldUpdates("ds1", "s1", [
      { datasetName: "pds", id: "p1", op: "deleteDocument" },
    ]);

    const body = captured?.body as Record<string, unknown>[];
    expect(body[0]).toEqual({
      id: "p1",
      datasetName: "pds",
      op: "deleteDocument",
    });
  });

  it("throws SaveConflictError carrying the field values on 409", async () => {
    fetchImpl.mockImplementation(
      async (config: { errorHandler: (r: unknown) => Promise<void> }) => {
        const response = {
          status: 409,
          json: async () => ({
            conflicts: [{ index: 0, value: { label: "other" } }],
          }),
        };
        await config.errorHandler(response);
        return { response: undefined };
      }
    );

    await expect(
      saveAnnotationFieldUpdates("ds1", "s1", [
        {
          collection: "samples.ds1",
          id: "s1",
          lookupPath: "primitive_field",
          previousValue: "a",
          newValue: "b",
        },
      ])
    ).rejects.toMatchObject({
      name: "Save Conflict Error",
      conflicts: [{ index: 0, value: { label: "other" } }],
    });
  });

  it("the thrown error is a SaveConflictError instance", async () => {
    fetchImpl.mockImplementation(
      async (config: { errorHandler: (r: unknown) => Promise<void> }) => {
        await config.errorHandler({
          status: 409,
          json: async () => ({ conflicts: [] }),
        });
        return { response: undefined };
      }
    );

    await expect(
      saveAnnotationFieldUpdates("ds1", "s1", [
        {
          collection: "c",
          id: "s1",
          lookupPath: "f",
          previousValue: 1,
          newValue: 2,
        },
      ])
    ).rejects.toBeInstanceOf(SaveConflictError);
  });
});
