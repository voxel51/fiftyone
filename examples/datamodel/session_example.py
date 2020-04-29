"""
Explore CIFAR100 via a `fiftyone.core.session.Session` instance.

"""
import logging

import fiftyone.core.dataset as voxd
import fiftyone.core.session as voxs
import fiftyone.core.query as voxq


logger = logging.getLogger(__name__)


# GUI displays dataset browser landing page
session = voxs.Session()


# GUI displays CIFAR100 dataset
session.dataset = voxd.Dataset("cifar100")

# GUI displays filtered/sorted CIFAR100 dataset
session.query = (
    voxq.DatasetQuery()
    .filter({"metadata.size_bytes": {"$gt": 1000}})
    .sort("metadata.size_bytes")
)

# GUI displays CIFAR100 datase
session.clear_query()

# displays dataset browser
session.clear_dataset()
