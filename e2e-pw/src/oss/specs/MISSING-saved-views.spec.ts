import { test as base, expect } from "src/oss/fixtures";
import { Color, SaveViewParams, SavedViewsPom } from "src/oss/poms/saved-views";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const ColorList = [
  "Gray",
  "Blue",
  "Purple",
  "Red",
  "Yellow",
  "Green",
  "Pink",
  "Orange",
  "Purple",
];

export const updatedView: SaveViewParams = {
  name: "test updated",
  description: "test updated",
  color: "Yellow" as Color,
};

export const updatedView2: SaveViewParams = {
  name: "test updated 2",
  description: "test updated 2",
  color: "Orange" as Color,
  slug: "test-updated-2",
};

const testView: SaveViewParams = {
  id: 0,
  name: "test",
  description: "description",
  color: "Gray" as Color,
  newColor: "Blue" as Color,
  slug: "test",
};

const testView1: SaveViewParams = {
  id: 1,
  name: "test 1",
  description: "description ",
  color: "Gray",
  newColor: "Orange",
  slug: "test-1",
};

const testView2: SaveViewParams = {
  id: 2,
  name: "test 2",
  description: "description 2",
  color: "Gray",
  newColor: "Yellow",
  slug: "test-2",
};

// todo: move it to the SavedViewsPom
async function deleteSavedView(savedViews: SavedViewsPom, slug: string) {
  const hasUnsaved = savedViews.canClearView();
  if (!hasUnsaved) {
    await savedViews.clearView();
  }

  await savedViews.openSelect();
  const count = await savedViews.savedViewOptionCount(slug);

  if (count) {
    await savedViews.clickOptionEdit(slug);
    await savedViews.clickDeleteBtn();
  }
}

const datasetName = getUniqueDatasetNameWithPrefix("quickstart-saved-views");

const test = base.extend<{ savedViews: SavedViewsPom }>({
  savedViews: async ({ page }, use) => {
    await use(new SavedViewsPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset_name = "${datasetName}"
    dataset = fo.Dataset(name=dataset_name)
    dataset.persistent = True

    dataset.add_sample(fo.Sample(filepath="image1.jpg"))
  `);
});

test.describe.serial("saved views", () => {
  test.beforeEach(async ({ page, fiftyoneLoader, savedViews }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await deleteSavedView(savedViews, testView.name);
    await deleteSavedView(savedViews, updatedView2.slug);
  });

  test("saved view basic operations", async ({ savedViews }) => {
    await expect(savedViews.selector).toBeVisible();
    await savedViews.openCreateModal();

    await savedViews.assert.verifyInputIsDefault();
    await savedViews.assert.verifySaveBtnIsDisabled();
    await savedViews.assert.verifyDeleteBtnHidden();
    await savedViews.nameInput().fill("test");
    await savedViews.descriptionInput().fill("test");
    await savedViews.colorInput().click();
    await savedViews.colorOption().click();
    await savedViews.assert.verifySaveBtnIsEnabled();
    await savedViews.assert.verifyCancelBtnClearsAll();

    // verify color selection has nine specific color choices
    await savedViews.clickColor();
    await savedViews.assert.verifyDefaultColors(ColorList);
    await savedViews.assert.verifyColorNotExists();
  });

  test("clearing a saved view clears the url and view selection", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.assert.verifySavedView();

    await savedViews.clearView();
    await savedViews.assert.verifyUnsavedView();
  });

  test("saving a view with an already existing name fails", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.assert.verifySelectionHasNewOption();

    await savedViews.openCreateModal();
    await savedViews.saveViewInputs(testView);

    await savedViews.assert.verifySaveViewFails();
  });

  test.fixme("searching through saved views works", async ({ savedViews }) => {
    await savedViews.saveView(testView1);
    await savedViews.clearViewBtn.waitFor({ state: "visible" });
    await savedViews.clearViewBtn.click();

    await savedViews.saveView(testView2);
    await savedViews.clearViewBtn.waitFor({ state: "visible" });
    await savedViews.clearView();

    await savedViews.selector.click();
    await savedViews.assert.verifySearchExists();

    await savedViews.assert.verifySearch("test 2", ["test-2"], ["test-1"]);
    await savedViews.assert.verifySearch("test 3", [], ["test-1", "test-2"]);
    await savedViews.assert.verifySearch("test", ["test-1", "test-2"], []);

    await savedViews.openSelect();
    await savedViews.deleteView("test-1");
    await savedViews.selector.click();
    await savedViews.deleteView("test-2");
  });

  test("deleting a saved view clears the URL view parameter and view selection", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.clearView();

    await savedViews.openSelect();
    await savedViews.assert.verifyViewOption();

    await savedViews.clickOptionEdit(testView.name);
    await savedViews.clickDeleteBtn();

    await savedViews.assert.verifyUnsavedView();
    await savedViews.openCreateModal({ isSelectAlreadyOpen: true });
    await savedViews.assert.verifyViewOptionHidden();
  });

  test("editing a saved view updates the view's name and description", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.clearView();

    await savedViews.openSelect();
    await savedViews.clickOptionEdit(testView.name);
    await savedViews.assert.verifyInput({
      name: testView.name,
      description: testView.description,
      color: testView.newColor,
    });

    await savedViews.editView(
      updatedView2.name,
      updatedView2.description,
      "Blue",
      updatedView2.color
    );

    await savedViews.openSelect();
    await savedViews.clickEdit(updatedView2.slug);
    await savedViews.assert.verifyDeleteBtn();
    await savedViews.assert.verifyInputUpdated(updatedView2);

    await savedViews.clickCloseModal();
    await savedViews.assert.verifyModalClosed();
  });

  test("editing a saved view should update the view URL parameter and selection", async ({
    savedViews,
  }) => {
    await savedViews.assert.verifyUnsavedView();

    await savedViews.saveView(testView);
    await savedViews.assert.verifySavedView();

    await savedViews.clearView();

    await savedViews.openSelect();
    await savedViews.clickOptionEdit(testView.name);
    await savedViews.editView(
      updatedView2.name,
      updatedView2.description,
      "Blue",
      updatedView2.color
    );

    await savedViews.assert.verifySavedView("test-updated");
  });
});
