import fiftyone as fo
import fiftyone.zoo as foz

fo.delete_datasets("*")
quickstart_groups_dataset = foz.load_zoo_dataset(
    "quickstart-groups", max_samples=12
)
quickstart_groups_dataset.persistent = True
