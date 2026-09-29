/**
 * Stage schema policy gating in the Annotate sidebar state
 * (`taskSchemaPolicy` → `visibleLabelSchemas` / `effectiveLabelSchemasData`).
 */

import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  activeLabelSchemas,
  managerSchemaDoc,
  taskLabelSchemaDoc,
  effectiveLabelSchemasData,
  exploreActiveFields,
  inactiveLabelSchemas,
  isFieldBboxLocked,
  isFieldReadOnly,
  labelSchemaData,
  labelSchemasData,
  taskSchemaPolicy,
  visibleLabelSchemas,
  type StageSchemaPolicy,
} from "./state";
import type { LabelSchemaMeta } from "./useSchemaManager";

const meta = (over: Partial<LabelSchemaMeta> = {}): LabelSchemaMeta =>
  ({ type: "detections", read_only: false, ...over }) as LabelSchemaMeta;

const seed = (policy: StageSchemaPolicy | null) => {
  const store = createStore();
  store.set(labelSchemasData, { gt: meta(), car: meta() });
  store.set(activeLabelSchemas, ["gt", "car"]);
  store.set(exploreActiveFields, ["gt", "car"]);
  store.set(taskSchemaPolicy, policy);
  return store;
};

describe("taskSchemaPolicy gating", () => {
  it("no policy → identity (the pre-overlay world)", () => {
    const store = seed(null);
    expect(store.get(visibleLabelSchemas)).toEqual(["gt", "car"]);
    // Reference equality: no copying when unrestricted.
    expect(store.get(effectiveLabelSchemasData)).toBe(
      store.get(labelSchemasData),
    );
  });

  it("hidden fields drop out of visibleLabelSchemas", () => {
    const store = seed({
      fields: { gt: { visibility: "hidden" } },
      default: "editable",
      excluded_paths: ["gt"],
    });
    expect(store.get(visibleLabelSchemas)).toEqual(["car"]);
  });

  it("default hidden hides unlisted fields", () => {
    const store = seed({
      fields: { car: { visibility: "editable" } },
      default: "hidden",
      excluded_paths: ["gt"],
    });
    expect(store.get(visibleLabelSchemas)).toEqual(["car"]);
  });

  it("read_only fields are stamped through labelSchemaData", () => {
    const store = seed({
      fields: { car: { visibility: "read_only" } },
      default: "editable",
      excluded_paths: [],
    });
    expect(isFieldReadOnly(store.get(labelSchemaData("car")))).toBe(true);
    expect(isFieldReadOnly(store.get(labelSchemaData("gt")))).toBe(false);
    // The raw map is never mutated — only the effective view is stamped.
    expect(store.get(labelSchemasData)?.car.read_only).toBe(false);
  });

  it("attribute policy masks the effective label_schema attributes", () => {
    const store = createStore();
    store.set(labelSchemasData, {
      car: meta({
        label_schema: {
          type: "detection",
          attributes: [
            { name: "color", type: "str" },
            { name: "year", type: "int" },
            { name: "occluded", type: "bool" },
          ],
        },
      } as unknown as Partial<LabelSchemaMeta>),
    });
    store.set(taskSchemaPolicy, {
      fields: {
        car: {
          visibility: "editable",
          attributes: { color: "editable", year: "hidden", "*": "read_only" },
        },
      },
      default: "editable",
      excluded_paths: [],
    });

    const attrs = store.get(labelSchemaData("car"))?.label_schema?.attributes;
    expect(attrs?.map((a: { name: string }) => a.name)).toEqual([
      "color",
      "occluded",
    ]);
    // Explicit editable stays live; wildcard read_only stamps the rest.
    expect(attrs?.[0].read_only).toBeUndefined();
    expect(attrs?.[1].read_only).toBe(true);
    // The raw map is untouched.
    expect(
      store.get(labelSchemasData)?.car.label_schema?.attributes,
    ).toHaveLength(3);
  });

  it("no attribute policy → attributes untouched", () => {
    const store = createStore();
    const raw = meta({
      label_schema: {
        type: "detection",
        attributes: [{ name: "color", type: "str" }],
      },
    } as unknown as Partial<LabelSchemaMeta>);
    store.set(labelSchemasData, { car: raw });
    store.set(taskSchemaPolicy, {
      fields: { car: { visibility: "editable" } },
      default: "editable",
      excluded_paths: [],
    });
    expect(store.get(labelSchemaData("car"))).toBe(raw);
  });

  it("class policy narrows the effective options list", () => {
    const store = createStore();
    store.set(labelSchemasData, {
      car: meta({
        label_schema: {
          type: "detection",
          classes: ["sedan", "suv", "van"],
        },
      } as unknown as Partial<LabelSchemaMeta>),
    });
    store.set(taskSchemaPolicy, {
      fields: {
        car: {
          visibility: "editable",
          classes: { van: "hidden" },
        },
      },
      default: "editable",
      excluded_paths: [],
    });
    expect(store.get(labelSchemaData("car"))?.label_schema?.classes).toEqual([
      "sedan",
      "suv",
    ]);
    // Wildcard-hidden with explicit include = include-list mode.
    store.set(taskSchemaPolicy, {
      fields: {
        car: {
          visibility: "editable",
          classes: { sedan: "editable", "*": "hidden" },
        },
      },
      default: "editable",
      excluded_paths: [],
    });
    expect(store.get(labelSchemaData("car"))?.label_schema?.classes).toEqual([
      "sedan",
    ]);
  });

  it("bbox read_only stamps bbox_read_only, not read_only", () => {
    const store = createStore();
    store.set(labelSchemasData, { car: meta() });
    store.set(taskSchemaPolicy, {
      fields: { car: { visibility: "editable", bbox: "read_only" } },
      default: "editable",
      excluded_paths: [],
    });
    const effective = store.get(labelSchemaData("car"));
    expect(effective?.bbox_read_only).toBe(true);
    // Attrs stay live: the field itself is NOT read-only.
    expect(isFieldReadOnly(effective)).toBe(false);
    expect(isFieldBboxLocked(effective)).toBe(true);
    // Field-level read-only also locks geometry.
    expect(isFieldBboxLocked(meta({ read_only: true }))).toBe(true);
  });

  it("attribute wildcard locks the class (label) input", () => {
    const store = createStore();
    store.set(labelSchemasData, {
      car: meta({
        label_schema: {
          type: "detection",
          classes: ["sedan", "suv"],
          attributes: [{ name: "tags", type: "list<str>" }],
        },
      } as unknown as Partial<LabelSchemaMeta>),
    });
    store.set(taskSchemaPolicy, {
      fields: {
        car: {
          visibility: "editable",
          attributes: { tags: "editable", "*": "read_only" },
        },
      },
      default: "editable",
      excluded_paths: [],
    });
    const schema = store.get(labelSchemaData("car"))?.label_schema;
    expect(schema?.label_read_only).toBe(true);
    // Explicitly granting "label" keeps the class input live.
    store.set(taskSchemaPolicy, {
      fields: {
        car: {
          visibility: "editable",
          attributes: { label: "editable", "*": "read_only" },
        },
      },
      default: "editable",
      excluded_paths: [],
    });
    expect(
      store.get(labelSchemaData("car"))?.label_schema?.label_read_only,
    ).toBeUndefined();
  });

  it("a resolved schema doc replaces the envelope wholesale", () => {
    const store = createStore();
    // Dataset-level state that must be IGNORED in doc mode.
    store.set(labelSchemasData, { gt: meta(), car: meta() });
    store.set(activeLabelSchemas, ["gt", "car"]);
    store.set(exploreActiveFields, ["gt"]); // stale explore set
    store.set(taskSchemaPolicy, {
      fields: { car: { visibility: "hidden" } },
      default: "editable",
      excluded_paths: ["car"],
    });

    const docCar = meta({ bbox_read_only: true });
    store.set(taskLabelSchemaDoc, {
      id: "d1",
      name: "lens",
      label_schemas: { car: docCar },
      active: ["car"],
      excluded_paths: ["gt"],
    });

    // Envelope = the doc's, verbatim; policy/overlay not consulted.
    expect(store.get(effectiveLabelSchemasData)).toEqual({ car: docCar });
    expect(store.get(labelSchemaData("car"))?.bbox_read_only).toBe(true);
    // Annotate membership = doc.active — explore intersection skipped.
    expect(store.get(visibleLabelSchemas)).toEqual(["car"]);
    // Closed contract: no add-field surface.
    expect(store.get(inactiveLabelSchemas)).toEqual([]);
  });

  it("manager-doc mode overlays doc content onto the envelope", () => {
    const store = createStore();
    const datasetCar = meta();
    store.set(labelSchemasData, { car: datasetCar, gt: meta() });
    store.set(managerSchemaDoc, {
      id: "d1",
      name: "lens",
      label_schema: { car: { type: "detections", classes: ["sedan"] } },
      visibility: { default: "explore", fields: {} },
    });
    const effective = store.get(effectiveLabelSchemasData);
    // Doc-modeled field serves the DOC's content...
    expect(effective?.car.label_schema?.classes).toEqual(["sedan"]);
    // ...while unmodeled fields still resolve from the dataset map.
    expect(effective?.gt).toBe(store.get(labelSchemasData)?.gt);
    // Clearing doc mode restores the raw envelope (modal close).
    store.set(managerSchemaDoc, null);
    expect(store.get(effectiveLabelSchemasData)).toBe(
      store.get(labelSchemasData),
    );
  });

  it("hidden fields cannot resurface via the inactive list", () => {
    const store = seed({
      fields: { gt: { visibility: "hidden" } },
      default: "editable",
      excluded_paths: ["gt"],
    });
    store.set(activeLabelSchemas, ["car"]);
    expect(store.get(inactiveLabelSchemas)).toEqual([]);
  });
});
