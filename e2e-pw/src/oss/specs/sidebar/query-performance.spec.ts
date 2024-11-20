import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("query-performance");

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.describe("query performance sidebar", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.Dataset("${datasetName}")
dataset.add_samples([fo.Sample(filepath=f"{i}.png") for i in range(0, 4)])
dataset.persistent = True

# NOT REAL VALUES

first = dataset.first()

first["bool"] = False
first["bool_list"] = False

first["inf"] = float("inf")
first["inf_list"] = [float("inf")]
first["inf_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=float("inf"))]
)

first["nan"] = float("nan")
first["nan_list"] = [float("nan")]
first["nan_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=float("nan"))]
)

first["ninf"] = float("-inf")
first["ninf_list"] = [float("-inf")]
first["ninf_label_list"] = fo.Classifications(
    classifications=[
        fo.Classification(label="label", confidence=float("-inf"))
    ]
)


first["str"] = "0"
first["str_list"] = ["0"]

first.save()

# REAL VALUES MAX

second = dataset.skip(1).first()

second["bool"] = False
second["bool_list"] = False

second["inf"] = 1.0
second["inf_list"] = [1.0]
second["inf_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=1.0)]
)

second["nan"] = 1.0
second["nan_list"] = [1.0]
second["nan_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=1.0)]
)

second["ninf"] = 1.0
second["ninf_list"] = [1.0]
second["ninf_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=float(1.0))]
)

second["str"] = "1"
second["str_list"] = ["1"]

second.save()

# REAL VALUES MIN

third = dataset.skip(2).first()

third["bool"] = True
third["bool_list"] = True

third["inf"] = -1.0
third["inf_list"] = [-1.0]
third["inf_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=-1.0)]
)

third["nan"] = -1.0
third["nan_list"] = [-1.0]
third["nan_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=-1.0)]
)

third["ninf"] = -1.0
third["ninf_list"] = [-1.0]
third["ninf_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=-1.0)]
)

third["str"] = "2"
third["str_list"] = ["2"]

third.save()

# NONE VALUES

fourth = dataset.skip(3).first()

fourth["bool"] = None
fourth["bool_list"] = None

fourth["inf"] = None
fourth["inf_list"] = None
fourth["inf_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=None)]
)

fourth["nan"] = None
fourth["nan_list"] = None
fourth["nan_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=None)]
)

fourth["ninf"] = None
fourth["ninf_list"] = None
fourth["ninf_label_list"] = fo.Classifications(
    classifications=[fo.Classification(label="label", confidence=None)]
)

fourth["str"] = None
fourth["str_list"] = None

dataset.create_index("$**")

fourth.save()
        `);

    test.beforeEach(async ({ page, fiftyoneLoader }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    });
    test("assert query performance icons", async ({ sidebar }) => {
      sidebar.asserter.assertFieldHasQueryPerformance("sample tags");
    });
  });
});
