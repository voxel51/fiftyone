import os

import numpy as np

import eta.core.serial as etas
import eta.core.image as etai

import fiftyone.core.odm as foo
import fiftyone.core.odm_wrappers as foow

foo.drop_database()

dataset = foow.Dataset(name="test_dataset")

img_path = "my_image.jpg"
if not os.path.exists(img_path):
    img = np.random.randint(0, 255, (32, 32, 3))
    etai.write(img, img_path)


###############################################################################
# Create a Sample
###############################################################################

sample = foow.Sample.create_new(filepath=img_path, tags=["train", "rand"])

###############################################################################
# Add to Dataset
###############################################################################

dataset.add_sample(sample)

###############################################################################
# Explore
###############################################################################

print("Datasets: %s" % foow.list_dataset_names())
print()

print("Num samples: %d" % len(dataset))
print()

print("Tags: %s" % dataset.get_tags())
print()

print("Label Groups: %s" % dataset.get_label_groups())
print()

print("Insight Groups: %s" % dataset.get_insight_groups())
print()

asdf = 0

# os.remove(img_path)