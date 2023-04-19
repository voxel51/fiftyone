import { Enum, List, ObjectType } from "./types";

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

  constructor(public ctx, public property) {
    this.params = ctx.params;
    this.errors = this.validate();
    this.invalid = this.errors.length > 0;
  }

  toProps() {
    return {
      invalid: this.invalid,
      errors: this.errors.map((error) => error.toProps()),
    };
  }

  addError(error) {
    this.errors.push(error);
  }

  private validate() {
    const { params } = this.ctx;
    this.errors = [];
    this.validateProperty("", this.property, params);
    return this.errors;
  }

  // todo: oneOf, Tuple
  validateProperty(path, property, value) {
    const { type } = property;
    if (property.invalid) {
      this.addError(new ValidationError("Invalid property", property, path));
    } else if ((property.required && value === undefined) || value === null) {
      this.addError(new ValidationError("Required property", property, path));
    } else if (type instanceof Enum) {
      this.validateEnum(path, property, value);
    } else if (type instanceof ObjectType) {
      this.validateObject(path, property, value);
    } else if (type instanceof List) {
      this.validateList(path, property, value);
    } else {
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
    if (!Array.isArray(value)) {
      return this.addError(new ValidationError("Invalid list", property, path));
    }
    const { elementType } = property.type;
    const elementProperty = { type: elementType };

    for (const i in value) {
      this.validateProperty(getPath(path, i), elementProperty, value[i]);
    }
  }

  validatePrimitive(path, property, value) {
    const propType = property.type.constructor.name.toLowerCase();
    if (typeof value !== propType) {
      return this.addError(
        new ValidationError("Invalid value type", property, path)
      );
    }
  }
}

function getPath(prefix, path) {
  return prefix ? prefix + "." + path : path;
}
