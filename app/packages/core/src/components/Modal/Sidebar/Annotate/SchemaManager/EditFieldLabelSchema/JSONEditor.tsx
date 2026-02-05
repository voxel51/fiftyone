import {
  CenteredStack,
  Code,
  LoadingSpinner,
  scrollable,
} from "@fiftyone/components";
import { Text, TextColor } from "@voxel51/voodo";
import { useEffect, useState } from "react";
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
      style={
        errors
          ? {
              border:
                "1px solid color-mix(in srgb, var(--color-semantic-destructive) 40%, transparent)",
            }
          : {}
      }
    >
      <Code
        defaultValue={value}
        onChange={(value) => {
          const strValue = value as string;
          onChange(strValue);
          setValue(strValue);
        }}
        language="json"
        height={"100%"}
        width={"100%"}
      />
    </ContentArea>
  );
};

export default JSONEditor;
