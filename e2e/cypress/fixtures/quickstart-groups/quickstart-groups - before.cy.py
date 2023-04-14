import fiftyone as fo
import fiftyone.zoo as foz

quickstart_groups_dataset = foz.load_zoo_dataset(
    "quickstart-groups", max_samples=12
)

session = fo.launch_app(quickstart_groups_dataset, remote=True)
session.wait(-1)
