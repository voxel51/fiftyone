/**
 * List default value input using SchemaIO's AutocompleteView.
 * Supports multiple values with freeSolo for custom input.
 */

import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import AutocompleteView from "../../../../../../../plugins/SchemaIO/components/AutocompleteView";

interface ListDefaultInputProps {
  /** Current default values as array */
  values: (string | number)[];
  /** Callback when values change */
  onChange: (values: (string | number)[]) => void;
  /** Available choices (from values list if component needs values) */
  choices?: (string | number)[];
  /** Whether values should be numeric */
  isNumeric?: boolean;
  /** Validation error from parent */
  error?: string | null;
}

const ListDefaultInput = ({
  values,
  onChange,
  choices = [],
  isNumeric = false,
  error = null,
}: ListDefaultInputProps) => {
  // Build SchemaIO-compatible schema for AutocompleteView
  const schema = {
    type: "array",
    view: {
      choices: choices.map((c) => ({ value: c, label: String(c) })),
      allow_user_input: true,
      allow_clearing: true,
      allow_duplicates: false,
      placeholder: isNumeric
        ? "Type a number and press Enter"
        : "Type a value and press Enter",
    },
  };

  const handleChange = (_path: string, newValues: unknown) => {
    if (Array.isArray(newValues)) {
      // Convert to numbers if numeric type
      const processed = isNumeric
        ? newValues.map((v) => {
            const num = parseFloat(String(v));
            return isNaN(num) ? v : num;
          })
        : newValues;
      onChange(processed);
    }
  };

  return (
    <div>
      <AutocompleteView
        schema={schema}
        data={values}
        onChange={handleChange}
        path="listDefault"
      />
      {error && (
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Destructive}
          style={{ marginTop: 4 }}
        >
          {error}
        </Text>
      )}
    </div>
  );
};

export default ListDefaultInput;
