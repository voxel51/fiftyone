import {
  CenteredStack,
  LoadingSpinner,
  scrollable,
} from "@fiftyone/components";
import { Text, TextColor } from "@voxel51/voodo";
import { useEffect, useState } from "react";
import { CodeView } from "../../../../../../plugins/SchemaIO/components";
import { ContentArea } from "../styled";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | Array<JSONValue>;

// JSON View component
const JSONEditor = ({
  data,
  errors = false,
  onChange,
  scanning,
}: {
  data: JSONValue;
  errors: boolean;
  onChange: (value: string) => void;
  scanning: boolean;
}) => {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(JSON.stringify(data, undefined, 2));
  }, [data]);

  if (scanning) {
    return (
      <CenteredStack spacing={1} sx={{ p: 3 }}>
        <LoadingSpinner />
        <Text color={TextColor.Secondary}>Scanning</Text>
      </CenteredStack>
    );
  }

  return (
    <ContentArea
      className={scrollable}
      style={errors ? { border: "1px solid rgba(212, 64, 64, 0.4)" } : {}}
    >
      <CodeView
        data={value}
        onChange={(_, value) => {
          onChange(value);
          setValue(value);
        }}
        schema={{
          view: {
            language: "json",
            readOnly: false,
            width: "100%",
            height: "100%",
            componentsProps: {
              container: {
                style: { height: "100%" },
              },
            },
          },
        }}
      />
    </ContentArea>
  );
};

export default JSONEditor;
