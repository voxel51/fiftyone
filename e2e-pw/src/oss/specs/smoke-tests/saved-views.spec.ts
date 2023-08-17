import { test as base, expect } from "src/oss/fixtures";
import { Color, SavedViewsPom } from "src/oss/poms/saved-views";
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

export const updatedView = {
  name: "test updated",
  description: "test updated",
  color: "Yellow" as Color,
};

export const updatedView2 = {
  name: "test updated 2",
  description: "test updated 2",
  color: "Orange" as Color,
  slug: "test-updated-2",
};

const testView = {
  id: 0,
  name: "test",
  description: "description",
  color: "Gray" as Color,
  newColor: "Blue" as Color,
  slug: "test",
};

const testView1 = {
  id: 1,
  name: "test 1",
  description: "description ",
  color: "Gray",
  newColor: "Orange",
  slug: "test-1",
};

const testView2 = {
  id: 2,
  name: "test 2",
  description: "description 2",
  color: "Gray",
  newColor: "Yellow",
  slug: "test-2",
};

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{ savedViews: SavedViewsPom }>({
  savedViews: async ({ page }, use) => {
    await use(new SavedViewsPom(page));
  },
});

test.describe("saved views", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
      max_samples: 5,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader, savedViews }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await deleteSavedView(savedViews, testView.name);
    await deleteSavedView(savedViews, updatedView2.slug);
  });

  async function deleteSavedView(savedViews, slug: string) {
    const hasUnsaved = savedViews.canClearView();
    if (!hasUnsaved) {
      await savedViews.clearView();
    }

    await savedViews.openSelect();
    const count = await savedViews.savedViewOptionCount(slug);

    if (count) {
      await savedViews.clickOptionEdit(slug);
      await savedViews.clickDeleteBtn();
    } else {
      await savedViews.openSelect();
    }
  }

  test("page has the correct title", async ({ page }) => {
    await expect(page).toHaveTitle(/FiftyOne/);
  });

  test("saved views selector exists", async ({ savedViews }) => {
    await expect(savedViews.selector()).toBeVisible();
  });

  test("clicking on the selector opens the view dialog with default values", async ({
    savedViews,
  }) => {
    await savedViews.openCreateModal();
    await savedViews.assert.verifyInputIsDefault();
  });

  test("saving a view is disabled if the name input is empty", async ({
    savedViews,
  }) => {
    await savedViews.openCreateModal();
    await savedViews.assert.verifySaveBtnIsDisabled();
  });

  test("saving a view is enabled if the name input has value", async ({
    savedViews,
  }) => {
    await savedViews.openCreateModal();
    await savedViews.assert.verifySaveBtnIsDisabled();
    await savedViews.nameInput().type("test");
    await savedViews.assert.verifySaveBtnIsEnabled();
  });

  test("cancel button clears the inputs", async ({ savedViews }) => {
    await savedViews.openCreateModal();

    await savedViews.nameInput().type("test");
    await savedViews.descriptionInput().type("test");
    await savedViews.colorInput().click();
    await savedViews.colorOption().click();

    await savedViews.assert.verifyCancelBtnClearsAll();
  });

  test("saving a valid view succeeds with view=view-slug as query parameter in the URL", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.assert.verifySavedView();
  });

  test("clearing a saved view clears the url and view selection", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.assert.verifySavedView();

    await savedViews.clearView();
    await savedViews.assert.verifyUnsavedView();
  });

  test("clicking on the close icon closes the save view modal", async ({
    savedViews,
  }) => {
    await savedViews.openCreateModal();
    await savedViews.clickCloseModal();
    await savedViews.assert.verifyModalClosed();
  });

  test("directly linking to a non-existing view clears view parameter", async ({
    page,
    savedViews,
  }) => {
    const nonExistingName = "test-name-non-existing";
    await page.goto(`/datasets/${datasetName}?view=${nonExistingName}`);
    await savedViews.assert.verifyUnsavedView(nonExistingName);
  });

  test("color selection has nine specific color choices", async ({
    savedViews,
  }) => {
    await savedViews.openCreateModal();
    await savedViews.clickColor();
    await savedViews.assert.verifyDefaultColors(ColorList);
    await savedViews.assert.verifyColorNotExists();
  });

  test("saving a view adds a new option to the saved views selector", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.assert.verifySelectionHasNewOption();
  });

  test("saving a view with an already existing name fails", async ({
    savedViews,
  }) => {
    await savedViews.saveView(testView);
    await savedViews.clearView();

    await savedViews.openCreateModal();
    await savedViews.saveViewInputs(testView);

    await savedViews.assert.verifySaveViewFails();
  });

  test("create and edit modals have the correct titles", async ({
    savedViews,
  }) => {
    await savedViews.openCreateModal();
    await savedViews.assert.verifyModalTitle("Create view close");
    await savedViews.closeModalBtn().click();

    await savedViews.saveView(testView);
    await savedViews.clickEdit("test");
    await savedViews.assert.verifyModalTitle("Edit view close");
    await savedViews.clickCloseModal();
  });

  test("searching through saved views works", async ({ savedViews }) => {
    await savedViews.saveView(testView1);
    await savedViews.clearViewBtn().click();

    await savedViews.saveView(testView2);
    await savedViews.clearView();

    await savedViews.selector().click();
    await savedViews.assert.verifySearchExists();

    await savedViews.assert.verifySearch("test 2", ["test-2"], ["test-1"]);
    await savedViews.assert.verifySearch("test 3", [], ["test-1", "test-2"]);
    await savedViews.assert.verifySearch("test", ["test-1", "test-2"], []);

    await savedViews.deleteView("test-1");
    await savedViews.selector().click();
    await savedViews.deleteView("test-2");
  });

  test("edit modal has a delete button but a create modal does not", async ({
    savedViews,
  }) => {
    await savedViews.openCreateModal();
    await savedViews.assert.verifyDeleteBtnHidden();

    await savedViews.closeModalBtn().click();
    await savedViews.saveView(testView);

    await savedViews.clickEdit("test");
    await savedViews.assert.verifyDeleteBtn();

    await savedViews.deleteViewClick();
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
    await savedViews.openCreateModal();
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

    await savedViews.clickEdit(updatedView2.slug);
    await savedViews.assert.verifyInputUpdated(updatedView2);
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
