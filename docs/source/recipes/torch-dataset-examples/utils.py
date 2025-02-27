import fiftyone as fo
from fiftyone.utils.torch import FiftyOneTorchDataset

import numpy as np
import torch
from torchvision.models import resnet18, ResNet18_Weights
import torchvision.transforms.v2 as transforms
from torchvision import tv_tensors
from PIL import Image

### basic_example.ipynb utils ###
augmentations_quickstart = transforms.Compose(
    [transforms.CenterCrop(512), transforms.ClampBoundingBoxes()]
)


def get_item_quickstart(sample):
    res = {}
    image = Image.open(sample["filepath"])
    og_wh = np.array([image.width, image.height])
    image = tv_tensors.Image(image)
    detections = sample["ground_truth.detections"]
    if detections is None:
        detections = []
    detections_tensor = (
        torch.tensor([detection["bounding_box"] for detection in detections])
        if len(detections) > 0
        else torch.zeros((0, 4))
    )
    res["box"] = tv_tensors.BoundingBoxes(
        detections_tensor * torch.tensor([*og_wh, *og_wh]),
        format=tv_tensors.BoundingBoxFormat("XYWH"),
        canvas_size=image.shape[-2:],
    )
    res["label"] = [detection["label"] for detection in detections]
    res["id"] = sample["id"]
    image, res = augmentations_quickstart(image, res)
    return image, res


def get_item_cached_quickstart(sample_dict):
    res = {}
    image = Image.open(sample_dict["filepath"])
    og_wh = np.array([image.width, image.height])
    image = tv_tensors.Image(image)
    detections = sample_dict["ground_truth.detections.bounding_box"]
    if detections is None:
        detections = []
    detections_tensor = (
        torch.tensor(detections)
        if len(detections) > 0
        else torch.zeros((0, 4))
    )
    res["box"] = tv_tensors.BoundingBoxes(
        detections_tensor * torch.tensor([*og_wh, *og_wh]),
        format=tv_tensors.BoundingBoxFormat("XYWH"),
        canvas_size=image.shape[-2:],
    )
    res["label"] = sample_dict["ground_truth.detections.label"]
    res["id"] = sample_dict["id"]
    image, res = augmentations_quickstart(image, res)
    return image, res


def simple_collate_fn(batch):
    return tuple(zip(*batch))


def create_dataloader_simple(torch_dataset):
    dataloader = torch.utils.data.DataLoader(
        torch_dataset,
        batch_size=5,
        shuffle=True,
        num_workers=2,  # we are compatible with many workers
        worker_init_fn=FiftyOneTorchDataset.worker_init,  # this is required for the dataloader to work
        collate_fn=simple_collate_fn,
    )
    return dataloader


def ids_in_dataloader(dataloader):
    # we can iterate over the dataset like this:
    ids_seen = []
    for images, results in dataloader:
        assert len(images) == 5  # we are actually getting a batch of 5
        ids_seen += [results[i]["id"] for i in range(len(results))]
    return ids_seen


### simple_training_example.ipynb utils ###
def mnist_index_to_label_string(index):
    num_2_word = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
    ]
    return f"{index} - {num_2_word[index]}"


convert_and_normalize = transforms.Compose(
    [transforms.ToImage(), transforms.ToDtype(torch.float32, scale=True)]
)


def mnist_get_item(sample):
    sample_id = sample["id"]
    image = convert_and_normalize(
        Image.open(sample["filepath"]).convert("RGB")
    )
    # labels are in the format "<number> - <number name english>"
    label = int(sample["ground_truth.label"][0])
    return {"image": image, "label": label, "id": sample_id}


def create_dataloaders(
    dataset,
    get_item,
    cache_field_names=None,
    local_process_group=None,
    **kwargs,
):
    split_tags = ["train", "validation", "test"]
    dataloaders = {}
    for split_tag in split_tags:
        split = dataset.match_tags(split_tag).to_torch(
            get_item,
            cache_field_names=cache_field_names,
            local_process_group=local_process_group,
        )
        shuffle = True if split_tag == "train" else False
        dataloader = torch.utils.data.DataLoader(
            split,
            shuffle=shuffle,
            worker_init_fn=FiftyOneTorchDataset.worker_init,
            **kwargs,
        )
        dataloaders[split_tag] = dataloader
    return dataloaders


def setup_model(num_classes, weights_path=None):
    model = resnet18(weights=ResNet18_Weights.DEFAULT)
    linear_head = torch.nn.Linear(512, num_classes)
    torch.nn.init.xavier_uniform_(linear_head.weight)
    model.fc = linear_head
    if weights_path is not None:
        model.load_state_dict(torch.load(weights_path, weights_only=True))
    return model


def setup_optim(model, lr=0.01, l2=0.00001):
    optimizer = torch.optim.SGD(model.parameters(), lr=lr, weight_decay=l2)
    return optimizer


### DDP utils ###


def setup_ddp_model(**kwargs):
    model = setup_model(**kwargs)
    model = torch.nn.SyncBatchNorm.convert_sync_batchnorm(model)
    return model


def create_dataloaders_ddp(
    dataset,
    get_item,
    cache_field_names=None,
    local_process_group=None,
    **kwargs,
):
    split_tags = ["train", "validation", "test"]
    dataloaders = {}
    for split_tag in split_tags:
        split = dataset.match_tags(split_tag).to_torch(
            get_item,
            cache_field_names=cache_field_names,
            local_process_group=local_process_group,
        )
        shuffle = True if split_tag == "train" else False
        dataloader = torch.utils.data.DataLoader(
            split,
            worker_init_fn=FiftyOneTorchDataset.worker_init,
            sampler=torch.utils.data.DistributedSampler(
                split, shuffle=shuffle
            ),
            **kwargs,
        )
        dataloaders[split_tag] = dataloader
    return dataloaders


if __name__ == "__main__":
    # this is just here to multiprocessing works when we call these functions in a notebook
    pass
