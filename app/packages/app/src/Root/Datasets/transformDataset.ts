import { clone, Field, Schema, StrictField } from "@fiftyone/utilities";
import { State } from "../../recoil/types";
import { DatasetQuery$data } from "./__generated__/DatasetQuery.graphql";

const toStrictField = (field: Field): StrictField => {
  return {
    ...field,
    fields: Object.entries(field.fields).map(([_, f]) => toStrictField(f)),
  };
};

const collapseFields = (
  paths: NonNullable<DatasetQuery$data["dataset"]>["sampleFields"]
): StrictField[] => {
  const schema: Schema = {};
  for (let i = 0; i < paths.length; i++) {
    const field = paths[i];
    const keys = field.path.split(".");
    let ref = schema;
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      ref[key] = ref[key] || ({ fields: {} } as Field);

      if (j === keys.length - 1) {
        ref[key] = {
          ...field,
          name: key,
          fields: ref[key].fields,
        };
      } else {
        ref = ref[key].fields;
      }
    }
  }

  return Object.entries(schema).map(([_, field]) => toStrictField(field));
};

const convertTargets = (
  targets: NonNullable<DatasetQuery$data["dataset"]>["defaultMaskTargets"]
) => {
  return Object.fromEntries(
    (targets || []).map<[number, string]>(({ target, value }) => [
      target,
      value,
    ])
  );
};

export default (
  dataset: DatasetQuery$data["dataset"]
): Readonly<State.Dataset> => {
  const targets = Object.fromEntries(
    (dataset?.maskTargets || []).map(({ name, targets }) => [
      name,
      convertTargets(targets),
    ])
  );

  const copy = clone(dataset);

  return {
    ...copy,
    defaultMaskTargets: convertTargets(dataset.defaultMaskTargets),
    brainMethods: [...dataset.brainMethods],
    evaluations: [...dataset.evaluations],
    frameFields: collapseFields(dataset.frameFields),
    sampleFields: collapseFields(dataset.sampleFields),
    maskTargets: targets,
    mediaType: dataset.mediaType === "image" ? "image" : "video",
  };
};
