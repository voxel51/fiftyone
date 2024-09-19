import {
  Box,
  FileDrop,
  Selection,
  TextInput
} from '@fiftyone/teams-components';
import { Stack, StackProps } from '@mui/material';
import { ComponentType, useEffect, useMemo, useState } from 'react';

type FieldType = 'text' | 'secret' | 'file' | 'select';

type SelectOption = {
  label: string;
  id: string;
};

type BasicFormField = {
  label?: string;
  type: FieldType;
  id: string;
  options?: Array<SelectOption>;
  fieldProps?: {}; // todo: have it based on type
  required?: boolean;
  description?: string | JSX.Element;
  caption?: string | JSX.Element;
  Component?: ComponentType<
    BasicFormField & { onChange: (value: unknown) => void }
  >;
};

export type BasicFormState = {
  fields?: Array<{ id: string; value: string | File }>;
  isValid?: boolean;
};

type BasicFormProps = StackProps & {
  fields: Array<BasicFormField>;
  onChange: (formState: BasicFormState) => void;
};

export default function BasicForm(props: BasicFormProps) {
  const { fields, onChange, ...stackProps } = props;
  const [form, setForm] = useState({});

  const formSchema = useMemo(() => {
    const schema = { requiredFields: [], fieldsById: {} };
    for (const field of fields) {
      if (field.required) schema.requiredFields.push(field.id);
      schema.fieldsById[field.id] = field;
    }
    return schema;
  }, [fields]);

  useEffect(() => {
    const formData = [];
    for (const field of fields) {
      const id = field.id;
      const value = form[id];
      if (value) formData.push({ id, value });
    }
    const formErrors = validateForm(form, formSchema);
    if (onChange)
      onChange({ fields: formData, isValid: formErrors.length === 0 });
  }, [form]);

  function changeHandler(id: string, value: unknown) {
    setForm({ ...form, [id]: value });
  }

  return (
    <Stack spacing={1.5} {...stackProps}>
      {fields.map((field) => {
        const Component = getFieldComponent(field);
        const props = getPropsForField(field, changeHandler);
        return <Component {...props} />;
      })}
    </Stack>
  );
}

function getFieldComponent(field: BasicFormField) {
  const { type, Component } = field;

  if (Component) return Component;

  const componentByFieldType = {
    file: FileDrop,
    text: TextInput,
    secret: TextInput,
    select: Selection
  };

  return componentByFieldType[type];
}

function getPropsForField(
  field: BasicFormField,
  changeHandler: (id: string, value: unknown) => void
) {
  const { type, label, id, options, fieldProps, description, caption } = field;

  if (field.Component) {
    // Do nothing... Handled by the default return
  } else if (type === 'text' || type === 'secret') {
    return {
      fieldLabel: label || '',
      description,
      caption,
      id,
      size: 'small',
      fullWidth: true,
      type: type === 'secret' ? 'password' : 'text',
      onChange: (e) => changeHandler(id, e.target.value),
      ...fieldProps
    };
  } else if (type === 'select') {
    return {
      label,
      description,
      caption,
      key: id,
      id,
      selectProps: { fullWidth: true },
      items: options,
      onChange: (value) => changeHandler(id, value),
      ...fieldProps
    };
  }

  return {
    label,
    description,
    caption,
    key: id,
    id,
    onChange: (value) => changeHandler(id, value),
    ...fieldProps
  };
}

function validateForm(form, formSchema) {
  const errors = [];
  const { fieldsById, requiredFields } = formSchema;
  for (const fieldId in fieldsById) {
    const field = fieldsById[fieldId];
    if (field.type === 'file') {
      if (requiredFields.includes(fieldId) && form[fieldId]?.length === 0) {
        errors.push({
          field: fieldId,
          message: 'At least one file is required'
        });
      }
    } else if (requiredFields.includes(fieldId) && !Boolean(form[fieldId])) {
      errors.push({
        field: fieldId,
        message: 'Must be a non-empty value'
      });
    }
  }
  return errors;
}
