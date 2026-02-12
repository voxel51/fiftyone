import {
  CenteredStack,
  Code,
  LoadingSpinner,
  scrollable,
} from "@fiftyone/components";
import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useEffect, useState } from "react";
import { ContentArea } from "../styled";

const SCHEMA_JSON_DOC_URL =
  "https://docs.voxel51.com/api/fiftyone.core.annotation.generate_label_schemas.html#module-fiftyone.core.annotation.generate_label_schemas";

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
  showDocumentation = true,
  onChange,
  scanning,
  onCancelScan,
}: {
  data: JSONValue;
  errors: boolean;
  onChange: (value: string) => void;
  scanning: boolean;
  onCancelScan?: () => void;
  showDocumentation: boolean;
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
        <Button
          size={Size.Sm}
          variant={Variant.Secondary}
          onClick={onCancelScan}
          style={{ marginTop: 8 }}
        >
          Cancel
        </Button>
      </CenteredStack>
    );
  }

  return (
    <>
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
      {showDocumentation && (
        <Text
          color={TextColor.Primary}
          variant={TextVariant.Md}
          style={{ marginTop: "0.5rem" }}
        >
          Learn more about the label schema format{" "}
          <a
            href={SCHEMA_JSON_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Text style={{ textDecoration: "underline" }}>
              in our documentation.
            </Text>
          </a>
        </Text>
      )}
    </>
  );
};

export default JSONEditor;
