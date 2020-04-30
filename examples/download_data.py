"""
Download CIFAR100 data and store as images and labels JSON to:
    {{fiftyone}}/examples/data/cifar100/

Data is downloaded as:
data/
└── cifar100/
    ├── test/                       # 10k INDEX.jpg test images
    ├── test_coarse.json            # coarse labels for test images
    ├── test_fine.json              # fine-grain labels for test images
    ├── train/                      # 50k INDEX.jpg train images
    ├── train_coarse.json           # coarse labels for test images
    └── train_fine.json             # fine-grain labels for train images

"""
import os

from tensorflow.keras.datasets import cifar100

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

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

coarse_2_fine_mapping = {
    "aquatic mammals": ["beaver", "dolphin", "otter", "seal", "whale"],
    "fish": ["aquarium_fish", "flatfish", "ray", "shark", "trout"],
    "flowers": ["orchid", "poppy", "rose", "sunflower", "tulip"],
    "food containers": ["bottle", "bowl", "can", "cup", "plate"],
    "fruit and vegetables": [
        "apple",
        "mushroom",
        "orange",
        "pear",
        "sweet_pepper",
    ],
    "household electrical device": [
        "clock",
        "computer_keyboard",
        "lamp",
        "telephone",
        "television",
    ],
    "household furniture": ["bed", "chair", "couch", "table", "wardrobe"],
    "insects": ["bee", "beetle", "butterfly", "caterpillar", "cockroach"],
    "large carnivores": ["bear", "leopard", "lion", "tiger", "wolf"],
    "large man-made outdoor things": [
        "bridge",
        "castle",
        "house",
        "road",
        "skyscraper",
    ],
    "large natural outdoor scenes": [
        "cloud",
        "forest",
        "mountain",
        "plain",
        "sea",
    ],
    "large omnivores and herbivores": [
        "camel",
        "cattle",
        "chimpanzee",
        "elephant",
        "kangaroo",
    ],
    "medium-sized mammals": ["fox", "porcupine", "possum", "raccoon", "skunk"],
    "non-insect invertebrates": ["crab", "lobster", "snail", "spider", "worm"],
    "people": ["baby", "boy", "girl", "man", "woman"],
    "reptiles": ["crocodile", "dinosaur", "lizard", "snake", "turtle"],
    "small mammals": ["hamster", "mouse", "rabbit", "shrew", "squirrel"],
    "trees": [
        "maple_tree",
        "oak_tree",
        "palm_tree",
        "pine_tree",
        "willow_tree",
    ],
    "vehicles 1": ["bicycle", "bus", "motorcycle", "pickup_truck", "train"],
    "vehicles 2": ["lawn_mower", "rocket", "streetcar", "tank", "tractor"],
}

fine_2_course_mapping = {
    fine: coarse
    for coarse, fine_list in coarse_2_fine_mapping.items()
    for fine in fine_list
}

dir_path = os.path.dirname(os.path.realpath(__file__))
data_dir = os.path.join(dir_path, "data/cifar100")

# if not empty, don't download
etau.ensure_empty_dir(data_dir)

(x_train, y_train), (x_test, y_test) = cifar100.load_data(label_mode="fine")

for partition, x, y in [
    ("train", x_train, y_train),
    ("test", x_test, y_test),
]:
    image_dir = os.path.join(data_dir, partition)
    etau.ensure_dir(image_dir)

    fine_labels = {}
    coarse_labels = {}

    for i in range(x.shape[0]):
        rel_img_path = os.path.join(partition, "%d.jpg" % i)
        abs_img_path = os.path.join(data_dir, rel_img_path)

        # write image
        img = x[i, :]
        etai.write(img, abs_img_path)

        # save labels
        fine_label = fine_labels_map[y[i, 0]]
        fine_labels[rel_img_path] = fine_label
        coarse_labels[rel_img_path] = fine_2_course_mapping[fine_label]

    etas.write_json(
        fine_labels,
        os.path.join(data_dir, "%s_fine.json") % partition,
        pretty_print=True,
    )

    etas.write_json(
        coarse_labels,
        os.path.join(data_dir, "%s_coarse.json") % partition,
        pretty_print=True,
    )
