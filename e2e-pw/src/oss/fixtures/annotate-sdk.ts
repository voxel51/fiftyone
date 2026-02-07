import { writeToTmpFile } from "src/oss/utils/fs";
import { OssLoader } from "./loader";

export class AnnotateSDK {
  loader: OssLoader;

  constructor() {
    this.loader = new OssLoader();
  }

  updateLabelSchema(dataset: string, field: string, schema: unknown) {
    const schemaFile = writeToTmpFile(JSON.stringify(schema), "json");

    return this.loader.executePythonCode(`
      import fiftyone as fo
      import json

      dataset = fo.load_dataset("${dataset}")

      with open("${schemaFile}") as f:
        label_schema_str = f.read()
        label_schema = json.loads(label_schema_str)
        dataset.update_label_schema("${field}", label_schema)
    `);
  }

  addFieldToActiveLabelSchema(dataset: string, field: string) {
    return this.loader.executePythonCode(`
      import fiftyone as fo

      dataset = fo.load_dataset("${dataset}")
      active_schemas = dataset.active_label_schemas

      field_name = "${field}"

      if field_name not in active_schemas:
          active_schemas.append(field_name)
          dataset.active_label_schemas = active_schemas
    `);
  }
}
