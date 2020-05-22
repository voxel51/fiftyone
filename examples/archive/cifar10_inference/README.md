# CIFAR-10 Inference Examples

Example of running inference with pretrained CIFAR-10 PyTorch models from
https://github.com/huyvnphan/PyTorch_CIFAR10.

## Setup

Install the models:

```shell
# Clone repository
git clone https://github.com/huyvnphan/PyTorch_CIFAR10
cd PyTorch_CIFAR10

# Download pretrained models
eta http download \
    https://rutgers.box.com/shared/static/hm73mc6t8ncy1z499fwukpn1xes9rswe.zip \
    cifar10_models/models.zip
unzip cifar10_models/models.zip -d cifar10_models/
rm cifar10_models/models.zip
```

Download the CIFAR-10 dataset:

```py
import torchvision

DATASET_DIR = "/tmp/cifar10/test"

torchvision.datasets.CIFAR10(dataset_dir, train=False, download=True)
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
