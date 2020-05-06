"""

"""

import os

import numpy as np

import eta.core.image as etai

import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos


foo.drop_database()

dataset = fod.Dataset("test_dataset")

img_path = "/tmp/my_image.jpg"

if not os.path.exists(img_path):
    img = np.random.randint(0, 255, (32, 32, 3))
    etai.write(img, img_path)

sample = fos.Sample.create(img_path, tags=["train", "rand"])

sample_id = dataset.add_sample(sample)

###############################################################################
# Explore
###############################################################################

print("Datasets: %s" % fod.list_dataset_names())
print()

print("Num samples: %d" % len(dataset))
print()

print("Label Groups: %s" % dataset.get_label_groups())
print()

###############################################################################
# Synchronization test
###############################################################################

labels = fol.ClassificationLabel.create(group="ground_truth", label="cow")

asdf = 0
