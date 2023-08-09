import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F

dynamic_groups = foz.load_zoo_dataset("quickstart-groups").clone()
dynamic_groups.persistent = True
dynamic_groups.name = "quickstart-groups-dynamic"

every_th_sample = 25
# for each slice, for every th samples, assign an arbitrary "scene_id"
for slice in dynamic_groups.group_slices:
    dynamic_groups.group_slice = slice
    scene_id_counter = 0
    order_by_counter = 0
    for sample in dynamic_groups:
        sample.set_field("scene_id", scene_id_counter // every_th_sample)
        sample.set_field("timestamp", order_by_counter % every_th_sample)
        sample.save()
        scene_id_counter = scene_id_counter + 1
        order_by_counter = order_by_counter + 1
