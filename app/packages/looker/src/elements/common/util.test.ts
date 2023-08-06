import { getColor } from "@fiftyone/utilities/src/color";
import { describe, expect, it } from "vitest";
import { Coloring, CustomizeColor } from "../../state";
import { getAssignedColor } from "./util";

const pool1 = "#EE0000";
const pool2 = "#EE6600";
const coloringByValue = {
  seed: 0,
  pool: [pool1, pool2, "#EEBB00", "#00EE00", "#00EEBB", "#0000EE"],
  by: "value",
  scale: [],
  maskTargets: {},
  points: false,
  targets: [],
} as Coloring;

const coloringByField = {
  seed: 1,
  pool: ["#EEBB00", "#00EE00", "#00EEBB", "#0000EE"],
  by: "field",
  scale: [],
  maskTargets: {},
  points: false,
  targets: [],
} as Coloring;

const color1 = "#900000"; // assigned color for field level setting
const color2 = "#000090"; // assigned color for attribute value level setting (label)
const color3 = "#009000"; // assigned color for attribute value level setting (tag)

const isValidColorMock = (color: string | undefined | null) => Boolean(color);

describe("EmbeddedDocumentField and tags bubbles get correct color", () => {
  const param1 = {
    id: "1",
    label: "telephone",
    tags: ["non-worm", "mistake"],
    _cls: "Classification",
  };

  const sampleInput1 = {
    coloring: coloringByField,
    path: "ground_truth",
    param: param1,
  };
  const sampleInput2 = {
    coloring: coloringByValue,
    path: "ground_truth",
    param: param1,
  };
  const defaultColor = getColor(
    coloringByField.pool,
    coloringByField.seed,
    "ground_truth"
  );

  const emptySetting = [];
  const emptySettingWithPath = [
    {
      path: "ground_truth",
    },
  ];

  it("Color by field mode, color can get resolved correctly in field mode with proper fallback", () => {
    const sampleSettingNullFieldColor = [
      {
        path: "ground_truth",
        fieldColor: null,
      },
    ];
    const sampleSettingClassificationDefaultAttribute = [
      {
        path: "ground_truth",
        fieldColor: color1,
        colorByAttribute: "label",
        valueColors: [
          {
            value: "telephone",
            color: color2,
          },
        ],
      },
    ];

    // when there is setting of selected path, use the field level color setting
    expect(
      getAssignedColor({
        ...sampleInput1,
        customizeColorSetting: sampleSettingClassificationDefaultAttribute,
        isValidColor: isValidColorMock,
      })
    ).toBe(color1);

    // Edge cases: fallback to default color
    expect(
      getAssignedColor({
        ...sampleInput1,
        customizeColorSetting: emptySetting,
        isValidColor: isValidColorMock,
      })
    ).toBe(defaultColor);
    expect(
      getAssignedColor({
        ...sampleInput1,
        customizeColorSetting: emptySettingWithPath,
        isValidColor: isValidColorMock,
      })
    ).toBe(defaultColor);
    expect(
      getAssignedColor({
        ...sampleInput1,
        customizeColorSetting: sampleSettingNullFieldColor,
        isValidColor: isValidColorMock,
      })
    ).toBe(defaultColor);
  });

  it("Color by value mode, when set properly, assigned color gets resolved correctly", () => {
    // Classification:
    const sampleSettingClassificationDefaultAttribute = [
      {
        path: "ground_truth",
        fieldColor: color1,
        colorByAttribute: "label",
        valueColors: [
          {
            value: "telephone",
            color: color2,
          },
        ],
      },
    ];
    const sampleSettingClassificationTagAsAttribute = [
      {
        path: "ground_truth",
        colorByAttribute: "tags",
        valueColors: [
          {
            value: "non-worm",
            color: color3,
          },
        ],
      },
    ];
    expect(
      getAssignedColor({
        ...sampleInput2,
        customizeColorSetting: sampleSettingClassificationDefaultAttribute,
        isValidColor: isValidColorMock,
      })
    ).toBe(color2);
    expect(
      getAssignedColor({
        ...sampleInput2,
        customizeColorSetting: sampleSettingClassificationTagAsAttribute,
        isValidColor: isValidColorMock,
      })
    ).toBe(color3);
  });

  it("Color by value mode, when colorByAttribute is null or not valid, use 'label' as default attribute", () => {
    const sampleSettingInvaidAttribute = [
      {
        path: "ground_truth",
        colorByAttribute: "ramdomString",
        valueColors: [
          {
            value: "telephone",
            color: color2,
          },
        ],
      },
    ];
    const sampleSettingNullAttribute = [
      {
        path: "ground_truth",
        colorByAttribute: null,
        valueColors: [
          {
            value: "telephone",
            color: color2,
          },
        ],
      },
    ];
    const sampleSettingNoAttribute = [
      {
        path: "ground_truth",
        valueColors: [
          {
            value: "telephone",
            color: color2,
          },
        ],
      },
    ];

    expect(
      getAssignedColor({
        ...sampleInput2,
        customizeColorSetting: sampleSettingInvaidAttribute,
        isValidColor: isValidColorMock,
      })
    ).toBe(color2);
    expect(
      getAssignedColor({
        ...sampleInput2,
        customizeColorSetting: sampleSettingNullAttribute,
        isValidColor: isValidColorMock,
      })
    ).toBe(color2);
    expect(
      getAssignedColor({
        ...sampleInput2,
        customizeColorSetting: sampleSettingNoAttribute,
        isValidColor: isValidColorMock,
      })
    ).toBe(color2);
  });

  it("Color by value mode, when no valid valueColors is available, fallback to default color", () => {
    const sampleSettingIncomplete = [];
    const sampleSettingEmptyValueColor = [
      {
        path: "ground_truth",
        colorByAttribute: "label",
        valueColors: [],
      },
    ];
    const sampleSettingNoValueColor = [
      {
        path: "ground_truth",
        colorByAttribute: "label",
      },
    ];
    expect(
      getAssignedColor({
        ...sampleInput2,
        customizeColorSetting: sampleSettingEmptyValueColor,
        isValidColor: isValidColorMock,
      })
    ).toBe(pool2);
    expect(
      getAssignedColor({
        ...sampleInput2,
        customizeColorSetting: sampleSettingNoValueColor,
        isValidColor: isValidColorMock,
      })
    ).toBe(pool2);
    expect(
      getAssignedColor({
        ...sampleInput2,
        customizeColorSetting: sampleSettingIncomplete,
        isValidColor: isValidColorMock,
      })
    ).toBe("#EE6600");
  });
});

describe("Primitive fields bubbles get correct color", () => {
  const sampleValue = "apple";
  const emptySetting = [];
  const emptySettingWithPath = [
    {
      path: "str_field",
    },
  ];
  const emptySettingNullFieldcolor = [
    {
      path: "str_field",
      fieldColor: null,
    },
  ];
  const sampleSettingNullValuecolors = [
    {
      path: "str_field",
      fieldColor: color1,
      valueColors: null,
    },
  ];

  it("Color by field mode, color can get resolved correctly in field mode with proper fallback", () => {
    const sampleInput = {
      coloring: coloringByField,
      path: "str_field",
      value: sampleValue,
    };
    const validFieldColorSetting = [
      {
        path: "str_field",
        fieldColor: color1,
      },
    ];

    // Correct case:
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: validFieldColorSetting,
        isValidColor: isValidColorMock,
      })
    ).toBe(color1);

    // Edge cases: fallback to default color of the field
    const defaultColor = getColor(
      coloringByField.pool,
      coloringByField.seed,
      "str_field"
    );
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: emptySetting,
        isValidColor: isValidColorMock,
      })
    ).toBe(defaultColor);
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: emptySettingWithPath,
        isValidColor: isValidColorMock,
      })
    ).toBe(defaultColor);
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: emptySettingNullFieldcolor,
        isValidColor: isValidColorMock,
      })
    ).toBe(defaultColor);
  });

  it("Color by value mode, edge cases fallback correctly", () => {
    const sampleInput = {
      coloring: coloringByValue,
      path: "str_field",
      value: sampleValue,
    };

    // Edge cases: fallback to default color of the field
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: emptySetting,
        isValidColor: isValidColorMock,
      })
    ).toBe(pool2);
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: emptySettingWithPath,
        isValidColor: isValidColorMock,
      })
    ).toBe(pool2);
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: emptySettingWithPath,
        isValidColor: isValidColorMock,
      })
    ).toBe(pool2);
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: emptySettingWithPath,
        isValidColor: isValidColorMock,
      })
    ).toBe(pool2);
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: emptySettingNullFieldcolor,
        isValidColor: isValidColorMock,
      })
    ).toBe(pool2);
    expect(
      getAssignedColor({
        ...sampleInput,
        customizeColorSetting: sampleSettingNullValuecolors,
        isValidColor: isValidColorMock,
      })
    ).toBe(pool2);
  });

  it("Color by value mode, stringField and list of stringField get assigned value color correctly", () => {
    const value1 = "orange, pear, apple, banana";
    const value2 = "apple";
    const sampleInputStr = {
      coloring: coloringByValue,
      path: "str_field",
      value: value1,
    };
    const sampleInputList = {
      coloring: coloringByValue,
      path: "str_field",
      value: value2,
    };
    const sampleSetting = [
      {
        path: "str_field",
        valueColors: [
          {
            value: "apple",
            color: color2,
          },
        ],
      },
    ];

    expect(
      getAssignedColor({
        ...sampleInputStr,
        customizeColorSetting: sampleSetting,
        isValidColor: isValidColorMock,
      })
    ).toBe(color2);
    expect(
      getAssignedColor({
        ...sampleInputList,
        customizeColorSetting: sampleSetting,
        isValidColor: isValidColorMock,
      })
    ).toBe(color2);
  });

  it("Color by value mode, intField and list of intField get assigned value color correctly", () => {
    const value1 = "3. 5, 8";
    const value2 = "8";
    const sampleInputInt = {
      coloring: coloringByValue,
      path: "int_field",
      value: value2,
    };
    const sampleInputList = {
      coloring: coloringByValue,
      path: "int_field",
      value: value1,
    };
    const intValueSettingString = [
      {
        path: "int_field",
        valueColors: [
          {
            value: "8",
            color: color2,
          },
        ],
      },
    ];
    const intValueSettingNumber = [
      {
        path: "int_field",
        valueColors: [
          {
            value: 8,
            color: color3,
          },
        ],
      },
    ] as unknown as CustomizeColor[];

    expect(
      getAssignedColor({
        ...sampleInputInt,
        customizeColorSetting: intValueSettingString,
        isValidColor: isValidColorMock,
      })
    ).toBe(color2);
    expect(
      getAssignedColor({
        ...sampleInputList,
        customizeColorSetting: intValueSettingNumber,
        isValidColor: isValidColorMock,
      })
    ).toBe(color3);
  });

  it("Color by value mode, booleanField get assigned value color correctly", () => {
    const value1 = "True";
    const value2 = "False";
    const sampleInputTrue = {
      coloring: coloringByValue,
      path: "bool_field",
      value: value1,
    };
    const sampleInputFalse = {
      coloring: coloringByValue,
      path: "bool_field",
      value: value2,
    };
    const booleanValue = [
      {
        path: "bool_field",
        valueColors: [
          {
            value: "True",
            color: color2,
          },
          {
            value: "False",
            color: color3,
          },
        ],
      },
    ];

    expect(
      getAssignedColor({
        ...sampleInputTrue,
        customizeColorSetting: booleanValue,
        isValidColor: isValidColorMock,
      })
    ).toBe(color2);
    expect(
      getAssignedColor({
        ...sampleInputFalse,
        customizeColorSetting: booleanValue,
        isValidColor: isValidColorMock,
      })
    ).toBe(color3);
  });
});
