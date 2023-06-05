import { pluralize } from "@fiftyone/utilities";
import { Enum, List, Object, Boolean, String, Number } from "./types";

export class ValidationError {
  constructor(public reason, public property, public path) {}

  toProps() {
    return { reason: this.reason, property: this.property, path: this.path };
  }
}

export class ValidationContext {
  params;
  errors = [];
  invalid;
  disableSchemaValidation;

  constructor(public ctx, public property, operator) {
    this.params = ctx.params;
    this.disableSchemaValidation = operator.config.disableSchemaValidation;
    this.errors = this.validate();
    this.invalid = this.errors.length > 0;
  }

  toProps() {
    return {
      invalid: this.invalid,
      errors: this.errors.map((error) => error.toProps()),
    };
  }

  addError(error, custom?: boolean) {
    if (this.disableSchemaValidation && !custom) return;
    this.errors.push(error);
  }

  private validate() {
    const { params } = this.ctx;
    this.errors = [];
    if (this.property) {
      this.validateProperty("", this.property, params);
    }
    return this.errors;
  }

  // todo: oneOf, Tuple
  validateProperty(path, property, value) {
    const { type } = property;
    const valueIsNullish = isNullish(value);
    if (property.invalid) {
      this.addError(
        new ValidationError(
          property.errorMessage || "Invalid property",
          property,
          path
        ),
        true
      );
    } else if (property.required && valueIsNullish) {
      this.addError(new ValidationError("Required property", property, path));
    } else if (type instanceof Enum && !valueIsNullish) {
      this.validateEnum(path, property, value);
    } else if (type instanceof Object && !valueIsNullish) {
      this.validateObject(path, property, value);
    } else if (type instanceof List) {
      this.validateList(path, property, value);
    } else if (isPrimitive(type) && !valueIsNullish) {
      this.validatePrimitive(path, property, value);
    }
  }

  validateEnum(path, property, value) {
    const { values } = property.type;
    if (!values.includes(value)) {
      this.addError(new ValidationError("Invalid enum value", property, path));
    }
  }

  validateObject(path, property, value) {
    if (value?.constructor?.name !== "Object") {
      this.addError(new ValidationError("Invalid object", property, path));
    } else {
      const props = property.type.properties;
      const propsKeys = property.type.properties.keys();
      for (const key of propsKeys) {
        this.validateProperty(getPath(path, key), props.get(key), value?.[key]);
      }
    }
  }

  validateList(path, property, value) {
    const { elementType, minItems, maxItems } = property.type;
    const valueIsNullish = isNullish(value);
    if (valueIsNullish && !isNumber(minItems)) return;
    const label = pluralize(minItems, "item", "items");
    const minItemsError = new ValidationError(
      `Must have at least ${minItems} ${label}`,
      property,
      path
    );
    if (!Array.isArray(value)) {
      return this.addError(minItemsError);
    } else {
      const length = value.length;

      if (isNumber(minItems) && length < minItems) {
        this.addError(minItemsError);
      }

      if (isNumber(maxItems) && length > maxItems) {
        this.addError(
          new ValidationError(
            `Must have at most ${maxItems} items`,
            property,
            path
          )
        );
      }

      const elementProperty = { type: elementType };

      for (const i in value) {
        this.validateProperty(getPath(path, i), elementProperty, value[i]);
      }
    }
  }

  validatePrimitive(path, property, value) {
    const expectedType = getOperatorTypeName(property.type);
    if (typeof value !== expectedType) {
      return this.addError(
        new ValidationError("Invalid value type", property, path)
      );
    }
  }
}

function getPath(prefix, path) {
  return prefix ? prefix + "." + path : path;
}

function isNullish(value) {
  return value === undefined || value === null;
}

function isNumber(value) {
  return typeof value === "number";
}

const primitiveTypes = ["boolean", "string", "number"];
function isPrimitive(type) {
  return primitiveTypes.includes(getOperatorTypeName(type));
}

function getOperatorTypeName(type) {
  if (type instanceof Boolean) return "boolean";
  if (type instanceof String) return "string";
  if (type instanceof Number) return "number";
}
