"""

"""

import os

import numpy as np

import eta.core.image as etai

import fiftyone.core.dataset as fod
import fiftyone.core.odm as foo
import fiftyone.core.labels as fol
import fiftyone.core.sample as fos


foo.drop_database()

dataset = fod.Dataset("test_dataset")

img_path = "/tmp/my_image.jpg"

if not os.path.exists(img_path):
    img = np.random.randint(0, 255, (32, 32, 3))
    etai.write(img, img_path)


###############################################################################
# Create a Sample
###############################################################################

sample = fos.Sample.create(img_path, tags=["train"])

label = fol.ClassificationLabel.create("cat")
sample.add_label("ground_truth", label)

print(sample.filepath)
print(sample.filename)
print(sample.labels["ground_truth"].label)

###############################################################################
# Add to Dataset
###############################################################################

sample_id = dataset.add_sample(sample)
# sample_ids = dataset.add_samples([sample])

###############################################################################
# Explore
###############################################################################

print("Datasets: %s" % fod.list_dataset_names())
print()

print("Num samples: %d" % len(dataset))
print()

print("Tags: %s" % dataset.get_tags())
print()

print("Label Groups: %s" % dataset.get_label_groups())
print()

print("Insight Groups: %s" % dataset.get_insight_groups())
print()

###############################################################################
# Synchronization test
###############################################################################

print(sample.id)
s2 = dataset[sample.id]
print(s2.id)

sample.add_tag("new_tag")
