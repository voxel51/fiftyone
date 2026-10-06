import { test as base, expect } from "src/oss/fixtures";
import { SaveViewParams, SavedViewsPom } from "src/oss/poms/saved-views";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const testView: SaveViewParams = {
  name: "test",
  description: "description",
  color: "Blue",
  slug: "test",
};

const testView1: SaveViewParams = {
  name: "test 1",
  description: "description ",
  color: "Orange",
  slug: "test-1",
};

const testView2: SaveViewParams = {
  name: "test 2",
  description: "description 2",
  color: "Yellow",
  slug: "test-2",
};

const updatedView: SaveViewParams = {
  name: "test updated 2",
  description: "test updated 2",
  color: "Orange",
  slug: "test-updated-2",
};

const test = base.extend<{ savedViews: SavedViewsPom }>({
  savedViews: async ({ page, eventUtils }, use) => {
    await use(new SavedViewsPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("saved views", () => {
  // a fresh, uniquely named dataset per test starts each one without saved
  // views; recreating one name leaves the server holding the deleted dataset
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, page }) => {
    const datasetName = getUniqueDatasetNameWithPrefix("saved-views");
    await datasetFactory.createDataset({ datasetName });
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("saved view basic operations", async ({ savedViews }) => {
    expect(await savedViews.selector.isVisible()).toBe(true);
    await savedViews.openSelect();
    await savedViews.openCreateModal();

    await savedViews.assert.verifyInputIsDefault();
    await savedViews.assert.verifySaveBtnIsDisabled();
    await savedViews.assert.verifyDeleteBtnHidden();
    await savedViews.fillName("test");
    await savedViews.fillDescription("test");
    await savedViews.clickColor();
    await savedViews.pickColor("Purple");
    await savedViews.assert.verifySaveBtnIsEnabled();
    await savedViews.assert.verifyCancelBtnClearsAll();

    await savedViews.clickColor();
    await savedViews.assert.verifyColorOptions();
  });

  test("clearing a saved view clears the url and view selection", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.assert.verifySavedView(testView);

    await savedViews.clearView();
    await savedViews.assert.verifyUnsavedView();
  });

  test("saving a view with an already existing name fails", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.clearView();
    await savedViews.openSelect();
    await savedViews.assert.verifyListedSlugs([testView.slug]);

    await savedViews.openCreateModal();
    await savedViews.fillInputs(testView);

    await savedViews.assert.verifySaveViewFails();
  });

  test("searching through saved views works", async ({ savedViews }) => {
    await savedViews.saveView(testView1);
    await savedViews.clearView();

    await savedViews.saveView(testView2);
    await savedViews.clearView();

    await savedViews.openSelect();
    await savedViews.assert.verifySearchExists();

    await savedViews.assert.verifySearch(testView2.name, [testView2.slug]);
    await savedViews.assert.verifySearch("test 3", []);
    await savedViews.assert.verifySearch("test", [
      testView1.slug,
      testView2.slug,
    ]);
  });

  test("deleting a saved view clears the URL view parameter and view selection", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.clearView();

    await savedViews.openSelect();
    await savedViews.assert.verifyListedSlugs([testView.slug]);

    await savedViews.clickOptionEdit(testView.slug);
    await savedViews.clickDeleteBtn();

    // the list stays open after the edit dialog deletes; it hides the
    // selector's combobox until it closes
    await savedViews.assert.verifyListedSlugs([]);
    await savedViews.closeSelect();
    await savedViews.assert.verifyUnsavedView();
  });

  test("editing a saved view updates the view's name and description", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.clearView();

    await savedViews.openSelect();
    await savedViews.clickOptionEdit(testView.slug);
    await savedViews.assert.verifyInput(testView);

    await savedViews.editView(updatedView);

    await savedViews.closeSelect();
    await savedViews.clearView();
    await savedViews.openSelect();
    await savedViews.clickOptionEdit(updatedView.slug);
    await savedViews.assert.verifyDeleteBtn();
    await savedViews.assert.verifyInput(updatedView);

    await savedViews.clickCloseModal();
    await savedViews.assert.verifyModalClosed();
  });

  test("editing a saved view should update the view URL parameter and selection", async ({
    savedViews,
  }) => {
    await savedViews.assert.verifyUnsavedView();

    await savedViews.saveView(testView);
    await savedViews.assert.verifySavedView(testView);

    await savedViews.clearView();

    await savedViews.openSelect();
    await savedViews.clickOptionEdit(testView.slug);
    await savedViews.editView(updatedView);

    // the list stays open after the edit dialog saves; it hides the
    // selector's combobox until it closes
    await savedViews.closeSelect();
    await savedViews.assert.verifySavedView(updatedView);
  });
});
