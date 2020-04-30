# Dataset Examples


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


## Copyright

Copyright 2017-2020, Voxel51, Inc.<br>
voxel51.com
