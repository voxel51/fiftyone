import { describe, expect, it } from "vitest";
import { LABEL_TYPE_OPTIONS, LABEL_TYPE_OPTIONS_VIDEO } from "./constants";
import {
  createDefaultFormData,
  defaultClassesComponent,
  formatAttributeCount,
  formatSchemaCount,
  getAttributeTypeLabel,
  getClassNameError,
  getLabelTypeOptions,
  reconcileComponent,
  toAttributeConfig,
  toFormData,
  validateFieldName,
} from "./utils";

describe("getAttributeTypeLabel", () => {
  it("should return human-readable label for known components", () => {
    expect(getAttributeTypeLabel("checkbox")).toBe("Checkbox");
    expect(getAttributeTypeLabel("checkboxes")).toBe("Checkboxes");
    expect(getAttributeTypeLabel("datepicker")).toBe("Date picker");
    expect(getAttributeTypeLabel("dropdown")).toBe("Dropdown");
    expect(getAttributeTypeLabel("json")).toBe("JSON");
    expect(getAttributeTypeLabel("radio")).toBe("Radio group");
    expect(getAttributeTypeLabel("slider")).toBe("Slider");
    expect(getAttributeTypeLabel("text")).toBe("Text");
    expect(getAttributeTypeLabel("toggle")).toBe("Toggle");
  });

  it("should return human-readable label for known types", () => {
    expect(getAttributeTypeLabel("bool")).toBe("Boolean");
    expect(getAttributeTypeLabel("list<bool>")).toBe("Boolean list");
    expect(getAttributeTypeLabel("date")).toBe("Date");
    expect(getAttributeTypeLabel("datetime")).toBe("Date/time");
    expect(getAttributeTypeLabel("dict")).toBe("Dictionary");
    expect(getAttributeTypeLabel("float")).toBe("Float");
    expect(getAttributeTypeLabel("list<float>")).toBe("Float list");
    expect(getAttributeTypeLabel("id")).toBe("ID");
    expect(getAttributeTypeLabel("int")).toBe("Integer");
    expect(getAttributeTypeLabel("list<int>")).toBe("Integer list");
    expect(getAttributeTypeLabel("str")).toBe("String");
    expect(getAttributeTypeLabel("list<str>")).toBe("String list");
  });

  it("should return the type as-is for unknown types", () => {
    expect(getAttributeTypeLabel("custom")).toBe("custom");
    expect(getAttributeTypeLabel("unknown")).toBe("unknown");
    expect(getAttributeTypeLabel("")).toBe("");
  });
});

describe("getClassNameError", () => {
  const existingClasses = ["ClassA", "ClassB", "ClassC"];

  it("should return null for valid class name", () => {
    expect(getClassNameError("NewClass", existingClasses)).toBe(null);
    expect(getClassNameError("AnotherClass", existingClasses)).toBe(null);
  });

  it("should return error for empty class name", () => {
    expect(getClassNameError("", existingClasses)).toBe(
      "Class name cannot be empty",
    );
    expect(getClassNameError("   ", existingClasses)).toBe(
      "Class name cannot be empty",
    );
  });

  it("should return error for duplicate class name", () => {
    expect(getClassNameError("ClassA", existingClasses)).toBe(
      "Class name already exists",
    );
    expect(getClassNameError("ClassB", existingClasses)).toBe(
      "Class name already exists",
    );
  });

  it("should allow current class name when editing", () => {
    expect(getClassNameError("ClassA", existingClasses, "ClassA")).toBe(null);
    expect(getClassNameError("ClassB", existingClasses, "ClassB")).toBe(null);
  });

  it("should still detect duplicates when editing different class", () => {
    expect(getClassNameError("ClassB", existingClasses, "ClassA")).toBe(
      "Class name already exists",
    );
  });

  it("should trim whitespace when checking", () => {
    expect(getClassNameError("  NewClass  ", existingClasses)).toBe(null);
    expect(getClassNameError("  ClassA  ", existingClasses)).toBe(
      "Class name already exists",
    );
  });
});

describe("formatAttributeCount", () => {
  it("should format singular correctly", () => {
    expect(formatAttributeCount(1)).toBe("1 attribute");
  });

  it("should format plural correctly", () => {
    expect(formatAttributeCount(0)).toBe("0 attributes");
    expect(formatAttributeCount(2)).toBe("2 attributes");
    expect(formatAttributeCount(10)).toBe("10 attributes");
  });
});

describe("formatSchemaCount", () => {
  it("should format singular correctly", () => {
    expect(formatSchemaCount(1)).toBe("1 schema");
  });

  it("should format plural correctly", () => {
    expect(formatSchemaCount(0)).toBe("0 schemas");
    expect(formatSchemaCount(2)).toBe("2 schemas");
    expect(formatSchemaCount(5)).toBe("5 schemas");
  });
});

describe("dynamic attribute flag", () => {
  it("defaults to false for a new attribute", () => {
    expect(createDefaultFormData().dynamic).toBe(false);
  });

  it("hydrates the form from a dynamic config", () => {
    const form = toFormData({
      name: "turn_signal",
      type: "str",
      dynamic: true,
    });
    expect(form.dynamic).toBe(true);
  });

  it("defaults the form to false when the config omits dynamic", () => {
    const form = toFormData({ name: "color", type: "str" });
    expect(form.dynamic).toBe(false);
  });

  it("serializes a dynamic attribute and omits it when false", () => {
    const dynamic = toAttributeConfig({
      ...createDefaultFormData(),
      name: "turn_signal",
      type: "str",
      dynamic: true,
    });
    expect(dynamic.dynamic).toBe(true);

    const static_ = toAttributeConfig({
      ...createDefaultFormData(),
      name: "color",
      type: "str",
    });
    expect(static_.dynamic).toBeUndefined();
  });
});

describe("attribute scope", () => {
  it("defaults to field scope for a new attribute", () => {
    expect(createDefaultFormData().scope).toBe("field");
  });

  it("hydrates the form from a point-scoped config", () => {
    const form = toFormData({
      name: "occluded",
      type: "bool",
      scope: "point",
    });
    expect(form.scope).toBe("point");
  });

  it("defaults the form to field scope when the config omits scope", () => {
    expect(toFormData({ name: "color", type: "str" }).scope).toBe("field");
  });

  it("serializes point scope and omits field scope", () => {
    const point = toAttributeConfig({
      ...createDefaultFormData(),
      name: "occluded",
      type: "bool",
      scope: "point",
    });
    expect(point.scope).toBe("point");

    const field = toAttributeConfig({
      ...createDefaultFormData(),
      name: "color",
      type: "str",
    });
    expect(field.scope).toBeUndefined();
  });

  it("drops the default value for point scope", () => {
    const config = toAttributeConfig({
      ...createDefaultFormData(),
      name: "occluded",
      type: "bool",
      scope: "point",
      default: "true",
    });
    expect(config.default).toBeUndefined();
  });
});

describe("validateFieldName", () => {
  it("rejects '.' for non-video media", () => {
    expect(validateFieldName("frames.detections", null, "image")).toMatch(
      /Invalid field name/,
    );
    expect(validateFieldName("detections", null, "image")).toBeNull();
  });

  it("allows a single 'frames.' prefix on video", () => {
    expect(validateFieldName("frames.detections", null, "video")).toBeNull();
    expect(validateFieldName("detections", null, "video")).toBeNull();
  });

  it("rejects deeper paths and a bare prefix on video", () => {
    expect(validateFieldName("frames.detections.foo", null, "video")).toMatch(
      /Invalid field name/,
    );
    expect(validateFieldName("frames.", null, "video")).toMatch(
      /Invalid field name/,
    );
  });

  it("flags duplicate field names", () => {
    expect(
      validateFieldName(
        "frames.detections",
        { "frames.detections": {} },
        "video",
      ),
    ).toBe("Field name already exists");
  });
});

describe("getLabelTypeOptions", () => {
  it("offers the spatial set for a video frame field", () => {
    expect(getLabelTypeOptions("video", true)).toBe(LABEL_TYPE_OPTIONS);
  });

  it("limits a sample-level video field to clip-level types", () => {
    expect(getLabelTypeOptions("video", false)).toBe(LABEL_TYPE_OPTIONS_VIDEO);
  });
});

describe("defaultClassesComponent", () => {
  const classes = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

  it("is radio up to the threshold and dropdown past it", () => {
    expect(defaultClassesComponent([])).toBe("radio");
    expect(defaultClassesComponent(classes(5))).toBe("radio");
    expect(defaultClassesComponent(classes(6))).toBe("dropdown");
  });
});

describe("reconcileComponent", () => {
  const classes = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

  it("derives radio for a text component with up to 5 classes", () => {
    expect(
      reconcileComponent({ component: "text", classes: classes(5) }).component,
    ).toBe("radio");
  });

  it("derives dropdown for a text component with more than 5 classes", () => {
    expect(
      reconcileComponent({ component: "text", classes: classes(6) }).component,
    ).toBe("dropdown");
  });

  it("treats a missing component like text", () => {
    expect(reconcileComponent({ classes: classes(30) }).component).toBe(
      "dropdown",
    );
  });

  it("preserves an explicit radio or dropdown regardless of class count", () => {
    expect(
      reconcileComponent({ component: "radio", classes: classes(30) })
        .component,
    ).toBe("radio");
    expect(
      reconcileComponent({ component: "dropdown", classes: classes(2) })
        .component,
    ).toBe("dropdown");
  });

  it("resets to text and strips classes when none remain", () => {
    expect(reconcileComponent({ component: "radio", classes: [] })).toEqual({
      component: "text",
    });
    expect(reconcileComponent({ component: "text", classes: [] })).toEqual({
      component: "text",
    });
  });
});
