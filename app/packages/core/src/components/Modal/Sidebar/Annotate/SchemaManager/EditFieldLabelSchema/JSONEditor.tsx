import {
  CenteredStack,
  LoadingSpinner,
  scrollable,
} from "@fiftyone/components";
import { Text, TextColor } from "@voxel51/voodo";
import { CodeView } from "../../../../../../plugins/SchemaIO/components";
import { ContentArea } from "../styled";

// JSON View component
const JSONEditor = ({
  data,
  errors = false,
  onChange,
  scanning,
}: {
  data: string;
  errors: boolean;
  onChange: (value: string) => void;
  scanning: boolean;
}) => {
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
        data={data}
        onChange={(_, value) => onChange(value)}
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
