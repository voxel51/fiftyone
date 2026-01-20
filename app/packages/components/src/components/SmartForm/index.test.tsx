import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import SmartForm from "./index";
import type { ValidatorType } from "@rjsf/utils";

// Mock the RJSF component
vi.mock("./RJSF", () => ({
  default: vi.fn((props) => {
    // Store props for assertions
    (global as any).__rjsfProps = props;
    return null;
  }),
}));

describe("SmartForm Component", () => {
  const simpleSchema = {
    type: "string" as const,
    view: {
      component: "FieldView" as const,
      label: "Name",
    },
  };

  afterEach(() => {
    delete (global as any).__rjsfProps;
  });

  describe("prop passthrough to RJSF", () => {
    it("should pass schema prop to RJSF", () => {
      render(<SmartForm schema={simpleSchema} />);

      const rjsfProps = (global as any).__rjsfProps;
      expect(rjsfProps.schema).toBe(simpleSchema);
    });

    it("should pass jsonSchema prop to RJSF", () => {
      const jsonSchema = {
        type: "string",
        title: "Name",
      };

      render(<SmartForm jsonSchema={jsonSchema} />);

      const rjsfProps = (global as any).__rjsfProps;
      expect(rjsfProps.jsonSchema).toBe(jsonSchema);
    });

    it("should pass uiSchema prop to RJSF", () => {
      const uiSchema = {
        "ui:widget": "textarea",
      };

      render(<SmartForm schema={simpleSchema} uiSchema={uiSchema} />);

      const rjsfProps = (global as any).__rjsfProps;
      expect(rjsfProps.uiSchema).toBe(uiSchema);
    });

    it("should pass data prop to RJSF", () => {
      const data = { name: "Test" };

      render(<SmartForm schema={simpleSchema} data={data} />);

      const rjsfProps = (global as any).__rjsfProps;
      expect(rjsfProps.data).toBe(data);
    });

    it("should pass onChange handler to RJSF", () => {
      const onChange = vi.fn();

      render(<SmartForm schema={simpleSchema} onChange={onChange} />);

      const rjsfProps = (global as any).__rjsfProps;
      expect(rjsfProps.onChange).toBe(onChange);
    });

    it("should pass onSubmit handler to RJSF", () => {
      const onSubmit = vi.fn();

      render(<SmartForm schema={simpleSchema} onSubmit={onSubmit} />);

      const rjsfProps = (global as any).__rjsfProps;
      expect(rjsfProps.onSubmit).toBe(onSubmit);
    });

    it("should pass validator prop to RJSF", () => {
      const customValidator: ValidatorType = {
        validateFormData: vi.fn(),
        toErrorList: vi.fn(),
        isValid: vi.fn(),
        rawValidation: vi.fn(),
      };

      render(<SmartForm schema={simpleSchema} validator={customValidator} />);

      const rjsfProps = (global as any).__rjsfProps;
      expect(rjsfProps.validator).toBe(customValidator);
    });

    it("should pass all props together", () => {
      const customValidator: ValidatorType = {
        validateFormData: vi.fn(),
        toErrorList: vi.fn(),
        isValid: vi.fn(),
        rawValidation: vi.fn(),
      };
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const data = { name: "Test" };
      const uiSchema = { "ui:widget": "textarea" };

      render(
        <SmartForm
          schema={simpleSchema}
          uiSchema={uiSchema}
          data={data}
          onChange={onChange}
          onSubmit={onSubmit}
          validator={customValidator}
        />
      );

      const rjsfProps = (global as any).__rjsfProps;
      expect(rjsfProps.schema).toBe(simpleSchema);
      expect(rjsfProps.uiSchema).toBe(uiSchema);
      expect(rjsfProps.data).toBe(data);
      expect(rjsfProps.onChange).toBe(onChange);
      expect(rjsfProps.onSubmit).toBe(onSubmit);
      expect(rjsfProps.validator).toBe(customValidator);
    });
  });
});
