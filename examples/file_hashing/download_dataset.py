"""
Download subset of CIFAR100 and store to disk:
    /tmp/fiftyone/cifar100_with_duplicates/

A random 5% of the samples are duplicates, instead of the original samples.

Data is downloaded as:
/tmp/fiftyone/
└── cifar100_with_duplicates/
    ├── <classA>/
    │   ├── <image1>.jpg
    │   ├── <image2>.jpg
    │   └── ...
    ├── <classB>/
    │   ├── <image1>.jpg
    │   ├── <image2>.jpg
    │   └── ...
    └── ...

"""
import os
import random

from tensorflow.keras.datasets import cifar100

import eta.core.image as etai
import eta.core.utils as etau

DATASET_SIZE = 1000

fine_labels_map = [
    "apple",
    "aquarium_fish",
    "baby",
    "bear",
    "beaver",
    "bed",
    "bee",
    "beetle",
    "bicycle",
    "bottle",
    "bowl",
    "boy",
    "bridge",
    "bus",
    "butterfly",
    "camel",
    "can",
    "castle",
    "caterpillar",
    "cattle",
    "chair",
    "chimpanzee",
    "clock",
    "cloud",
    "cockroach",
    "couch",
    "crab",
    "crocodile",
    "cup",
    "dinosaur",
    "dolphin",
    "elephant",
    "flatfish",
    "forest",
    "fox",
    "girl",
    "hamster",
    "house",
    "kangaroo",
    "computer_keyboard",
    "lamp",
    "lawn_mower",
    "leopard",
    "lion",
    "lizard",
    "lobster",
    "man",
    "maple_tree",
    "motorcycle",
    "mountain",
    "mouse",
    "mushroom",
    "oak_tree",
    "orange",
    "orchid",
    "otter",
    "palm_tree",
    "pear",
    "pickup_truck",
    "pine_tree",
    "plain",
    "plate",
    "poppy",
    "porcupine",
    "possum",
    "rabbit",
    "raccoon",
    "ray",
    "road",
    "rocket",
    "rose",
    "sea",
    "seal",
    "shark",
    "shrew",
    "skunk",
    "skyscraper",
    "snail",
    "snake",
    "spider",
    "squirrel",
    "streetcar",
    "sunflower",
    "sweet_pepper",
    "table",
    "tank",
    "telephone",
    "television",
    "tiger",
    "tractor",
    "train",
    "trout",
    "tulip",
    "turtle",
    "wardrobe",
    "whale",
    "willow_tree",
    "wolf",
    "woman",
    "worm",
]

dir_path = os.path.dirname(os.path.realpath(__file__))
data_dir = os.path.join(dir_path, "/tmp/fiftyone/cifar100_with_duplicates")

# if not empty, delete current contents
etau.ensure_empty_dir(data_dir, cleanup=True)

(_, _), (x_test, y_test) = cifar100.load_data(label_mode="fine")

dataset_size = min(DATASET_SIZE, 10000)

x = x_test[:dataset_size, :]
y = y_test[:dataset_size, :]

for i in range(x.shape[0]):
    if random.random() > 0.95:
        # pick a random sample 5% of the time
        idx = random.randint(0, x.shape[0])
    else:
        idx = i

    # get label
    fine_label = fine_labels_map[y[idx, 0]]

    # read image
    img = x[idx, :]

    etau.ensure_dir(data_dir)

    rel_img_path = os.path.join(fine_label, "%d.jpg" % i)
    abs_img_path = os.path.join(data_dir, rel_img_path)

    etai.write(img, abs_img_path)
