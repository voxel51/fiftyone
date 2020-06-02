"""
Runs prediction with the trained model.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import sys

import numpy as np
import torch
import torchvision
from torch.utils.data import DataLoader

import fiftyone.utils.torch as fout


def make_cifar10_data_loader(image_paths, sample_ids, batch_size):
    mean = [0.4914, 0.4822, 0.4465]
    std = [0.2023, 0.1994, 0.2010]
    transforms = torchvision.transforms.Compose(
        [
            torchvision.transforms.ToTensor(),
            torchvision.transforms.Normalize(mean, std),
        ]
    )
    dataset = fout.TorchImageDataset(
        image_paths, sample_ids=sample_ids, transform=transforms
    )
    return DataLoader(dataset, batch_size=batch_size, num_workers=4)


def predict(model, imgs):
    inputs = dict(input=imgs.cuda().half())
    outputs = model(inputs)
    logits = outputs["logits"].detach().cpu().numpy()
    predictions = np.argmax(logits, axis=1)
    odds = np.exp(logits)
    confidences = np.max(odds, axis=1) / np.sum(odds, axis=1)
    return predictions, confidences, logits


#
# Extract a few images to process
#

num_samples = 1000
batch_size = 20
view = train_view.sample(num_samples)
image_paths, sample_ids = zip(*[(s.filepath, s.id) for s in view])
data_loader = make_cifar10_data_loader(image_paths, sample_ids, batch_size)

#
# Perform prediction and store results in dataset
#

model.train(False)
with torch.no_grad():
    for imgs, sample_ids in data_loader:
        predictions, _, logits_ = predict(model, imgs)

        # Add predictions to the FiftyOne dataset
        for sample_id, prediction, logits in zip(
            sample_ids, predictions, logits_
        ):
            sample = dataset[sample_id]
            sample.add_tag("processed")
            sample["walkthrough"] = fo.Classification(
                label=cifar10_map[prediction], logits=logits,
            )
            sample.save()

#
# Print some information about the predictions
#

num_processed = len(train_view.match_tag("processed"))
num_mistaken = len(train_view.match_tag("processed").match_tag("mistake"))
print(
    "%d processed and %d of these have artificially corrupted labels"
    % (num_processed, num_mistaken)
)
