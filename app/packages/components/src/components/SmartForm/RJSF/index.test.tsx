import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import RJSF from "./index";
import type { ValidatorType } from "@rjsf/utils";

// Mock the Form component from @rjsf/mui
vi.mock("@rjsf/mui", () => ({
  default: vi.fn((props) => {
    // Store props for assertions
    (global as any).__rjsfFormProps = props;
    return null;
  }),
}));

// Mock widgets to prevent importing from @fiftyone/core which pulls in plotly.js
vi.mock("./widgets", () => ({
  default: {},
}));

// Mock templates to prevent any dependency issues
vi.mock("./templates", () => ({
  default: {},
}));

describe("RJSF Component", () => {
  const simpleSchema = {
    type: "string" as const,
    view: {
      component: "FieldView" as const,
      label: "Name",
    },
  };

  afterEach(() => {
    delete (global as any).__rjsfFormProps;
  });

  describe("validator prop", () => {
    it("should use default validator when not provided", () => {
      render(<RJSF schema={simpleSchema} />);

      const formProps = (global as any).__rjsfFormProps;
      expect(formProps.validator).toBeDefined();
    });

    it("should use custom validator when provided", () => {
      const customValidator: ValidatorType = {
        validateFormData: vi.fn(),
        toErrorList: vi.fn(),
        isValid: vi.fn(),
        rawValidation: vi.fn(),
      };

      render(<RJSF schema={simpleSchema} validator={customValidator} />);

      const formProps = (global as any).__rjsfFormProps;
      expect(formProps.validator).toBe(customValidator);
    });
  });

  describe("prop passthrough", () => {
    it("should pass through onChange handler", () => {
      const onChange = vi.fn();
      render(<RJSF schema={simpleSchema} onChange={onChange} />);

      const formProps = (global as any).__rjsfFormProps;
      expect(formProps.onChange).toBeDefined();
    });

    it("should pass through onSubmit handler", () => {
      const onSubmit = vi.fn();
      render(<RJSF schema={simpleSchema} onSubmit={onSubmit} />);

      const formProps = (global as any).__rjsfFormProps;
      expect(formProps.onSubmit).toBeDefined();
    });

    it("should pass through data prop", () => {
      const data = { name: "Test" };
      render(<RJSF schema={simpleSchema} data={data} />);

      const formProps = (global as any).__rjsfFormProps;
      expect(formProps.formData).toBe(data);
    });
  });

  describe("schema handling", () => {
    it("should handle SchemaIO format", () => {
      render(<RJSF schema={simpleSchema} />);

      const formProps = (global as any).__rjsfFormProps;
      expect(formProps.schema).toBeDefined();
    });

    it("should handle JSON Schema format", () => {
      const jsonSchema = {
        type: "string",
        title: "Name",
      };

      render(<RJSF jsonSchema={jsonSchema} />);

      const formProps = (global as any).__rjsfFormProps;
      expect(formProps.schema).toEqual(jsonSchema);
    });

    it("should return null when neither schema nor jsonSchema provided", () => {
      const { container } = render(<RJSF />);
      expect(container.firstChild).toBeNull();
    });
  });
});
