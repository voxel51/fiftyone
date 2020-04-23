# FiftyOne Examples

Currently, a random collection of useful code snippets to kickoff the project.


## `datasets.py`

Examples of loading common datasets via Torchvision.

This requires `matplotlib`, `numpy`, `torch`, `torchvision`.

You can install Pytorch as follows (taken from THETA install script):

```shell
# Installs `torch` and `torchvision`
OS=$(uname -s)
if [ "${OS}" == "Linux" ]; then
    if [ $(cat /usr/local/cuda/version.txt | grep -c "CUDA Version 9") -gt 0 ]; then
        echo "Installing Pytorch for CUDA 9"
        pip install torch==1.4.0+cu92 torchvision==0.5.0+cu92 -f https://download.pytorch.org/whl/torch_stable.html
    elif [ $(cat /usr/local/cuda/version.txt | grep -c "CUDA Version 10") -gt 0 ]; then
        echo "Installing Pytorch for CUDA 10"
        pip install torch==1.4.0 torchvision==0.5.0
    else
        echo "Installing Pytorch for CPU"
        pip install torch==1.4.0+cpu torchvision==0.5.0+cpu -f https://download.pytorch.org/whl/torch_stable.html
    fi
elif [ "${OS}" == "Darwin" ]; then
    echo "Installing Pytorch for CPU"
    pip install torch==1.4.0 torchvision==0.5.0
fi
```

If you want to work with the COCO dataset, you'll need to install the COCO API
as follows (taken from THETA install script):

```shell
# Installs COCO API at `pycocotools/`
git clone https://github.com/cocodataset/cocoapi.git
make --directory=cocoapi/PythonAPI
cp -r cocoapi/PythonAPI/pycocotools pycocotools/
rm -rf cocoapi
```


## `inference.py`

Examples of performing inference on CIFAR10 using pretrained Pytorch models.

The following will download the pretrained models:

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


## Copyright

Copyright 2017-2020, Voxel51, Inc.<br>
voxel51.com

