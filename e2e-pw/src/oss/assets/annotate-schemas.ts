export const ground_truth_schema = {
  attributes: [
    {
      name: "attributes",
      type: "dict",
      component: "json",
    },
    {
      name: "confidence",
      type: "float",
      component: "text",
    },
    {
      name: "id",
      type: "id",
      component: "text",
      read_only: true,
    },
    {
      name: "index",
      type: "int",
      component: "text",
    },
    {
      name: "mask_path",
      type: "str",
      component: "text",
    },
    {
      name: "tags",
      type: "list<str>",
      component: "text",
    },
  ],
  classes: [
    "bird",
    "bottle",
    "cake",
    "carrot",
    "cat",
    "chair",
    "cup",
    "dining table",
    "fork",
    "horse",
    "knife",
    "person",
    "surfboard",
  ],
  component: "dropdown",
  type: "detections",
};

export const uniqueness_schema = {
  type: "float",
  component: "slider",
  range: [0.6844698885072961, 0.8175834390151201],
};
