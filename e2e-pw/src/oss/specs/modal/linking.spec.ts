import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("linking");
const groupDatasetName = getUniqueDatasetNameWithPrefix("group-linking");

const id = "000000000000000000000000";

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    from bson import ObjectId

    import fiftyone as fo

    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True

    sample = fo.Sample(_id=ObjectId("${id}"), filepath="sample.png")
    dataset._sample_collection.insert_many(
        [dataset._make_dict(sample, include_id=True)]
    )


    group_dataset = fo.Dataset("${groupDatasetName}")
    group_dataset.persistent = True

    group = fo.Group(id="${id}")
    group_sample = fo.Sample(
        filepath="group_sample.png", group=group.element("only")
    )
    group_dataset.add_sample(group_sample)`);
});

test(`sample linking`, async ({ page, fiftyoneLoader, modal }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });

  await modal.waitForSampleLoadDomAttribute(true);

  await modal.assert.isOpen();
  await modal.sidebar.assert.verifySidebarEntryText("id", id);
});

test(`group linking`, async ({ page, fiftyoneLoader, modal }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, groupDatasetName, {
    searchParams: new URLSearchParams({ groupId: id }),
  });

  await modal.waitForSampleLoadDomAttribute(true);

  await modal.assert.isOpen();
  await modal.sidebar.assert.verifySidebarEntryText("group.id", id);
});
