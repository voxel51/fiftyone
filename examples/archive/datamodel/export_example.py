"""
Export some apples

"""
import logging

import fiftyone.core.dataset as fod


logger = logging.getLogger(__name__)


###############################################################################
# We choose the first 10 samples sorted by "fine" ground truth label
###############################################################################

dataset = fod.Dataset(name="cifar100")

view = (
    dataset.default_view().sort_by("labels.ground_truth_fine.label").limit(10)
)

###############################################################################
# And then export!
#
# `group` specifies which labels to export with the images and `export_dir`
# is the location where the export is created
###############################################################################

view.export(group="ground_truth_fine", export_dir="/tmp/export")
