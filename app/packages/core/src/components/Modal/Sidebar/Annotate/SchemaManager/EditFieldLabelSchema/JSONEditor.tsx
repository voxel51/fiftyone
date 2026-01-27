import { CenteredStack, Code, LoadingSpinner } from "@fiftyone/components";
import { Typography } from "@mui/material";
import React from "react";
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
        <Typography color="secondary">Scanning</Typography>
      </CenteredStack>
    );
  }

  return (
    <ContentArea
      style={errors ? { border: "1px solid rgba(212, 64, 64, 0.4)" } : {}}
    >
      <Code
        defaultValue={data}
        onChange={(value) => {
          onChange(value as string);
        }}
        language="json"
        height={"100%"}
        width={"100%"}
      />
    </ContentArea>
  );
};

export default JSONEditor;
