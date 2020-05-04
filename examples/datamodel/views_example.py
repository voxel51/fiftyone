"""
Explore CIFAR100 data that has been ingested into a dataset

"""
import logging

import fiftyone.core.dataset as fod
import fiftyone.core.view as fov


logger = logging.getLogger(__name__)


dataset = fod.Dataset(name="cifar100")

###############################################################################
# Action 0: Create an "empty" view
#
# A DatasetView is a powerful tool for looking at subsets of a dataset. A view
# is effectively a wrapper around a dataset and a pipeline of transforms.
# Transforms including filtering, sorting, random sampling, and many more
# powerful operations!
#
# We can perform basic operations on views like iterating over samples the
# same as with a dataset, however modifying the view by adding, removing,
# or replacing samples is not permitted. That being said, once a sample is
# accessed, modifications to the sample can be performed regardless of whether
# it was accessed from a dataset or a view on that dataset.
###############################################################################

view = fov.DatasetView(dataset=dataset)

print("Num samples: %d" % len(view))

print("Sample from view:")
sample = next(view.iter_samples())
print(sample)
print("Ingested at: %s" % sample.ingest_time)
print()

print("Samples can NOT be added, deleted or replaced from a view:")
print("Can add sample to dataset: %s" % hasattr(dataset, "add_sample"))
print("Can add sample to view: %s" % hasattr(view, "add_sample"))
print()


###############################################################################
# Action 1: Filter by "tag"
###############################################################################

tag = "rand"
view2 = view.filter(tag=tag)
print("Num samples with '%s' tag: %d" % (tag, len(view2)))
print()
