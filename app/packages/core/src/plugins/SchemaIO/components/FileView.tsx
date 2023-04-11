import { Box } from "@mui/material";
import React, { useState } from "react";
import FileDrop from "./FileDrop";
import Header from "./Header";
import TabsView from "./TabsView";
import TextFieldView from "./TextFieldView";

export default function FileView(props) {
  const { onChange, path, schema } = props;
  const { view = {} } = schema;
  const { types } = view;
  const [type, setType] = useState("file");

  return (
    <Box>
      <Header {...view} />
      <TabsView
        schema={{
          view: {
            choices: [
              { value: "file", label: "Upload" },
              { value: "url", label: "URL" },
            ],
          },
        }}
        onChange={(path, value) => {
          setType(value);
          onChange(path, "");
        }}
      />
      <Box sx={{ pt: 1 }}>
        {type === "file" && (
          <FileDrop
            onChange={async (files) => {
              if (files?.length === 0) return onChange(path, "");
              const [file] = files;
              const { error, result } = await fileToBase64(file);
              if (error) return; // todo: handle error
              onChange(path, result);
            }}
            types={types}
            // allowMultiple={allowMultiple}
          />
        )}
        {type === "url" && (
          <TextFieldView
            schema={{ view: { placeholder: "URL to a file" } }}
            onChange={onChange}
          />
        )}
      </Box>
    </Box>
  );
}

function fileToBase64(
  file: File
): Promise<{ result?: string; error?: ProgressEvent<EventTarget> }> {
  return new Promise((resolve) => {
    const fileReader = new FileReader();
    fileReader.readAsDataURL(file);
    fileReader.onload = () => resolve({ result: fileReader.result as string });
    fileReader.onerror = (error) => resolve({ error });
  });
}
