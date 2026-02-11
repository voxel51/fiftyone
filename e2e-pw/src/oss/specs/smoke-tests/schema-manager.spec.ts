import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("image-classification");
const videoDatasetName = getUniqueDatasetNameWithPrefix("video-dataset");
const detectionDatasetName =
  getUniqueDatasetNameWithPrefix("detection-dataset");
const groupVideoDatasetName = getUniqueDatasetNameWithPrefix(
  "group-video-dataset"
);

const id = "000000000000000000000000";
const videoId = "000000000000000000000001";
const groupVideoId = "000000000000000000000003";

const classificationFieldName = "animal_type_field";
const classificationClasses = ["dog", "cat"];
const primitiveFieldName = "test_float_field";
const sliderRange = { min: "0", max: "100" };
const detectionFieldName = "test_detection_field";
const detectionAttribute = {
  name: "sensor",
  values: ["nikon", "sony", "zeiss"],
};
const intRadioFieldName = "test_int_radio_field";
const intRadioValues = ["0", "1", "2"];
const dateFieldName = "test_date_field";
const boolFieldName = "test_bool_field";
const dictFieldName = "test_dict_field";
const stringListFieldName = "test_string_list_field";
const stringListValues = ["a", "b", "c", "d", "e", "f"];
const stringListSelections = ["a", "c", "e"];

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  schemaManager: SchemaManagerPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  schemaManager: async ({ page, eventUtils }, use) => {
    await use(new SchemaManagerPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, mediaFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createBlankImage({
    outputPath: "/tmp/blank.png",
    width: 50,
    height: 50,
    fillColor: "#ffffff",
    hideLogs: true,
  });

  await fiftyoneLoader.executePythonCode(`
  from bson import ObjectId
  import fiftyone as fo

  dataset = fo.Dataset("${datasetName}")

  sample = fo.Sample(
      _id=ObjectId("${id}"),
      classification=fo.Classification(label="value"),
      filepath="/tmp/blank.png"
  )
  dataset._sample_collection.insert_many(
      [dataset._make_dict(sample, include_id=True)]
  )

  dataset.add_sample_field(
      "classification",
      fo.EmbeddedDocumentField,
      embedded_doc_type=fo.Classification,
  )
  dataset.save()`);

  await fiftyoneLoader.executePythonCode(`
  import fiftyone as fo

  dataset = fo.Dataset("${detectionDatasetName}")
  sample = fo.Sample(
      filepath="/tmp/blank.png",
      predictions=fo.Detections(detections=[
          fo.Detection(label="cat", bounding_box=[0.1, 0.1, 0.2, 0.2]),
          fo.Detection(label="dog", bounding_box=[0.3, 0.3, 0.2, 0.2]),
      ])
  )
  dataset.add_samples([sample])

  # Save patches view for testing annotation disabled on generated views
  patches = dataset.to_patches("predictions")
  dataset.save_view("patches", patches)`);

  await mediaFactory.createBlankVideo({
    outputPath: "/tmp/blank-video.webm",
    duration: 1,
    width: 50,
    height: 50,
    frameRate: 5,
    color: "#000000",
  });

  await fiftyoneLoader.executePythonCode(`
  from bson import ObjectId
  import fiftyone as fo

  dataset = fo.Dataset("${videoDatasetName}")
  dataset.media_type = "video"
  sample = fo.Sample(
      _id=ObjectId("${videoId}"),
      filepath="/tmp/blank-video.webm"
  )
  # Use internal API to preserve the explicit ObjectId needed
  # for the beforeEach URL navigation (?id=...) to open the modal
  dataset._sample_collection.insert_many(
      [dataset._make_dict(sample, include_id=True)]
  )
  dataset.save()`);

  await fiftyoneLoader.executePythonCode(`
  from bson import ObjectId
  import fiftyone as fo

  dataset = fo.Dataset("${groupVideoDatasetName}")
  dataset.add_group_field("group", default="video1")
  group = fo.Group()
  sample = fo.Sample(
      _id=ObjectId("${groupVideoId}"),
      filepath="/tmp/blank-video.webm",
      group=group.element("video1")
  )
  dataset.add_samples([sample])`);
});

const DEFAULT_LABEL_SCHEMA = {
  attributes: [
    { name: "confidence", type: "float", component: "text" },
    { name: "id", type: "id", component: "text", read_only: true },
    { name: "tags", type: "list<str>", component: "text" },
  ],
  component: "text",
  type: "classification",
};

test.describe.serial("schema manager", () => {
  test("JSON view configuration", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    // Init
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Configure
    const row = schemaManager.getFieldRow("classification");
    // on initial click is setup, later it's edit()
    const jsonEditor = await row.scan();
    await jsonEditor.switchToJSONTab();
    await jsonEditor.assert.hasJSON(DEFAULT_LABEL_SCHEMA);

    // Unsuccessful validation
    const invalid = jsonEditor.waitForInvalidJSON();
    await jsonEditor.setJSON({
      component: "wrong",
      type: "classification",
    });
    await invalid;
    await jsonEditor.assert.hasErrors([
      "invalid component 'wrong' for field 'classification'",
    ]);

    // Discard
    await jsonEditor.discard();
    await jsonEditor.assert.hasJSON(DEFAULT_LABEL_SCHEMA);

    // Successful validation
    const valid = jsonEditor.waitForValidJSON();
    await jsonEditor.setJSON({
      component: "text",
      type: "classification",
    });
    await valid;

    // Scan
    await jsonEditor.scan();
    await jsonEditor.assert.hasJSON({
      ...DEFAULT_LABEL_SCHEMA,
      component: "radio",
      classes: ["value"],
    });

    // Save (automatically navigates back to field list)
    // First save auto-activates the field
    await jsonEditor.save();

    // Field should already be active after first save
    await schemaManager.assert.hasActiveFieldRows([
      { name: "classification", type: "Classification" },
    ]);

    // Hide
    await row.clickCheckbox();
    await row.assert.isChecked(true);
    await schemaManager.moveFields();
    await schemaManager.assert.hasHiddenFieldRows([
      { name: "classification", type: "Classification" },
    ]);

    // Close
    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });

  test("schema state resets when switching to video dataset", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    // Start on image dataset - annotate tab should be functional
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.assert.isEnabled();

    // Switch to video dataset
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, videoDatasetName, {
      searchParams: new URLSearchParams({ id: videoId }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Annotation should be disabled for video datasets
    await modal.sidebar.assert.hasDisabledMessage(
      "isn\u2019t supported for video datasets"
    );
    await schemaManager.assert.isDisabled();
  });

  test("annotation disabled for patches view", async ({
    fiftyoneLoader,
    page,
    grid,
    modal,
    schemaManager,
  }) => {
    // Start on detection dataset - annotation should be enabled
    await fiftyoneLoader.waitUntilGridVisible(page, detectionDatasetName);
    await grid.openFirstSample();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.assert.isEnabled();

    // Switch to patches view
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, detectionDatasetName, {
      searchParams: new URLSearchParams({ view: "patches" }),
    });

    // Open first sample in the patches grid
    await grid.openFirstSample();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Annotation should be disabled for generated views
    await modal.sidebar.assert.hasDisabledMessage(
      "isn\u2019t supported for patches, frames, clips"
    );
    await schemaManager.assert.isDisabled();
  });

  test("annotation disabled for grouped dataset with no supported slices", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    // Navigate to grouped video dataset
    await fiftyoneLoader.waitUntilGridVisible(page, groupVideoDatasetName, {
      searchParams: new URLSearchParams({ id: groupVideoId }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Annotation should be disabled for grouped datasets with no supported slices
    await modal.sidebar.assert.hasDisabledMessage(
      "has no slices that support annotation"
    );
    await schemaManager.assert.isDisabled();
  });

  test("add new classification field", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Create a new classification field with classes
    await schemaManager.clickNewField();
    await schemaManager.fillFieldName(classificationFieldName);
    await schemaManager.selectType("Classification");
    for (const cls of classificationClasses) {
      await schemaManager.addClass(cls);
    }
    await schemaManager.create();

    // Verify field auto-activated in active fields
    await schemaManager.assert.hasActiveFieldRows([
      { name: classificationFieldName, type: "Classification" },
    ]);

    // Close schema manager and return to annotation sidebar
    await schemaManager.close();
    await schemaManager.assert.isClosed();

    // Create a new classification annotation, select field, and verify classes
    await modal.sidebar.clickCreateClassification();
    await modal.sidebar.assert.hasFieldOption(classificationFieldName);
    await modal.sidebar.selectField(classificationFieldName);
    await modal.sidebar.assert.hasRadioOptions(classificationClasses);
  });

  test("add new primitive slider field", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Create a new primitive slider field
    await schemaManager.clickNewField();
    await schemaManager.fillFieldName(primitiveFieldName);
    await schemaManager.selectPrimitiveCategory();
    await schemaManager.selectType("Float");
    await schemaManager.selectComponentType("slider");
    await schemaManager.fillRange(sliderRange.min, sliderRange.max);
    await schemaManager.create();

    // Verify field auto-activated in active fields
    await schemaManager.assert.hasActiveFieldRows([
      { name: primitiveFieldName, type: "Float" },
    ]);

    // Open the field's edit view to verify slider configuration
    const row = schemaManager.getFieldRow(primitiveFieldName);
    await row.assert.hasRangeConfig(sliderRange.min, sliderRange.max);

    // Close schema manager
    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });

  test("add new detection field with attribute", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Create a new detection field with an attribute
    // Default label type is already "Detections", no need to select it
    await schemaManager.clickNewField();
    await schemaManager.fillFieldName(detectionFieldName);

    // Add "sensor" attribute: String type, Radio component, with values
    await schemaManager.clickAddAttribute();
    await schemaManager.fillAttributeName(detectionAttribute.name);
    await schemaManager.selectComponentType("radio");
    for (const value of detectionAttribute.values) {
      await schemaManager.addAttributeValue(value);
    }
    await schemaManager.saveAttribute();
    await schemaManager.create();

    // Verify field auto-activated in active fields
    await schemaManager.assert.hasActiveFieldRows([
      { name: detectionFieldName, type: "Detections" },
    ]);

    // Close schema manager and return to annotation sidebar
    await schemaManager.close();
    await schemaManager.assert.isClosed();

    // Create a new detection annotation, select field, and verify attribute radio options
    await modal.sidebar.clickCreateDetection();
    await modal.sidebar.assert.hasFieldOption(detectionFieldName);
    await modal.sidebar.selectField(detectionFieldName);
    await modal.sidebar.assert.hasRadioOptions(detectionAttribute.values);
  });

  test("add new integer field with radio values", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Create integer field with radio component and values
    await schemaManager.clickNewField();
    await schemaManager.fillFieldName(intRadioFieldName);
    await schemaManager.selectPrimitiveCategory();
    await schemaManager.selectType("Integer");
    await schemaManager.selectComponentType("radio");
    for (const value of intRadioValues) {
      await schemaManager.addAttributeValue(value);
    }
    await schemaManager.create();

    // Verify field in active fields
    await schemaManager.assert.hasActiveFieldRows([
      { name: intRadioFieldName, type: "Int" },
    ]);

    // Verify radio component type is preserved in edit view
    const intRow = schemaManager.getFieldRow(intRadioFieldName);
    await intRow.assert.hasComponentType("radio");

    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });

  test("add new date field with datepicker", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Create date field (datepicker is default and only component)
    await schemaManager.clickNewField();
    await schemaManager.fillFieldName(dateFieldName);
    await schemaManager.selectPrimitiveCategory();
    await schemaManager.selectType("Date");
    await schemaManager.create();

    // Verify field in active fields
    await schemaManager.assert.hasActiveFieldRows([
      { name: dateFieldName, type: "Date" },
    ]);

    await schemaManager.close();
    await schemaManager.assert.isClosed();

    // Close and reopen modal to refresh sample data with the new field
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Verify date picker renders in annotation sidebar
    await modal.sidebar.clickPrimitiveEntry(dateFieldName);
    await modal.sidebar.assert.hasDatePicker();
  });

  test("add new boolean field with toggle", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Create boolean field (toggle is default component)
    await schemaManager.clickNewField();
    await schemaManager.fillFieldName(boolFieldName);
    await schemaManager.selectPrimitiveCategory();
    await schemaManager.selectType("Boolean");
    await schemaManager.create();

    // Verify field in active fields
    await schemaManager.assert.hasActiveFieldRows([
      { name: boolFieldName, type: "Bool" },
    ]);

    await schemaManager.close();
    await schemaManager.assert.isClosed();

    // Close and reopen modal to refresh sample data with the new field
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Verify toggle renders in annotation sidebar
    await modal.sidebar.clickPrimitiveEntry(boolFieldName);
    await modal.sidebar.assert.hasToggle();
  });

  test("add new dictionary field with json editor", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Create dictionary field (json is default and only component)
    await schemaManager.clickNewField();
    await schemaManager.fillFieldName(dictFieldName);
    await schemaManager.selectPrimitiveCategory();
    await schemaManager.selectType("Dictionary");
    await schemaManager.create();

    // Verify field in active fields
    await schemaManager.assert.hasActiveFieldRows([
      { name: dictFieldName, type: "Dict" },
    ]);

    // Verify json component type in edit view
    const dictRow = schemaManager.getFieldRow(dictFieldName);
    await dictRow.assert.hasComponentType("json");

    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });

  test("add new string list field with checkboxes and select values", async ({
    fiftyoneLoader,
    page,
    modal,
    schemaManager,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    // Create string list field with checkboxes component and values
    await schemaManager.clickNewField();
    await schemaManager.fillFieldName(stringListFieldName);
    await schemaManager.selectPrimitiveCategory();
    await schemaManager.selectType("String list");
    for (const value of stringListValues) {
      await schemaManager.addAttributeValue(value);
    }
    await schemaManager.create();

    // Verify field in active fields
    await schemaManager.assert.hasActiveFieldRows([
      { name: stringListFieldName, type: "List<str>" },
    ]);

    await schemaManager.close();
    await schemaManager.assert.isClosed();

    // Close and reopen modal to refresh sample data with the new field
    await modal.close();
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    // Verify in annotation sidebar — renders as autocomplete with configured choices
    await modal.sidebar.clickPrimitiveEntry(stringListFieldName);
    for (const value of stringListSelections) {
      await modal.sidebar.selectAutocompleteOption(value);
    }
    await modal.sidebar.assert.hasSelectedTags(stringListSelections);
  });
});
