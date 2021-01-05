
.. _model-zoo-models:

Available Zoo Models
====================

.. default-role:: code

This page lists all of the models available in the Model Zoo.

.. note::

    Check out the :ref:`API reference <model-zoo-api>` for complete
    instructions for using the Model Zoo.

.. _model-zoo-torch-models:

Torch models
------------

Available models
________________

.. table::
    :widths: 40 60

    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | Model name                                                                                     | Tags                                        |
    +================================================================================================+=============================================+
    | :ref:`alexnet-imagenet-torch <model-zoo-alexnet-imagenet-torch>`                               | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`deeplabv3-resnet101-coco-torch <model-zoo-deeplabv3-resnet101-coco-torch>`               | segmentation, coco, torch                   |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`deeplabv3-resnet50-coco-torch <model-zoo-deeplabv3-resnet50-coco-torch>`                 | segmentation, coco, torch                   |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`densenet121-imagenet-torch <model-zoo-densenet121-imagenet-torch>`                       | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`densenet161-imagenet-torch <model-zoo-densenet161-imagenet-torch>`                       | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`densenet169-imagenet-torch <model-zoo-densenet169-imagenet-torch>`                       | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`densenet201-imagenet-torch <model-zoo-densenet201-imagenet-torch>`                       | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`faster-rcnn-resnet50-fpn-coco-torch <model-zoo-faster-rcnn-resnet50-fpn-coco-torch>`     | detection, coco, torch                      |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`fcn-resnet101-coco-torch <model-zoo-fcn-resnet101-coco-torch>`                           | segmentation, coco, torch                   |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`fcn-resnet50-coco-torch <model-zoo-fcn-resnet50-coco-torch>`                             | segmentation, coco, torch                   |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`googlenet-imagenet-torch <model-zoo-googlenet-imagenet-torch>`                           | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`inception-v3-imagenet-torch <model-zoo-inception-v3-imagenet-torch>`                     | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`keypoint-rcnn-resnet50-fpn-coco-torch <model-zoo-keypoint-rcnn-resnet50-fpn-coco-torch>` | keypoints, coco, torch                      |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`mask-rcnn-resnet50-fpn-coco-torch <model-zoo-mask-rcnn-resnet50-fpn-coco-torch>`         | instances, coco, torch                      |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`mnasnet0.5-imagenet-torch <model-zoo-mnasnet0.5-imagenet-torch>`                         | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`mnasnet1.0-imagenet-torch <model-zoo-mnasnet1.0-imagenet-torch>`                         | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`mobilenet-v2-imagenet-torch <model-zoo-mobilenet-v2-imagenet-torch>`                     | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`resnet101-imagenet-torch <model-zoo-resnet101-imagenet-torch>`                           | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`resnet152-imagenet-torch <model-zoo-resnet152-imagenet-torch>`                           | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`resnet18-imagenet-torch <model-zoo-resnet18-imagenet-torch>`                             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`resnet34-imagenet-torch <model-zoo-resnet34-imagenet-torch>`                             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`resnet50-imagenet-torch <model-zoo-resnet50-imagenet-torch>`                             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`resnext101-32x8d-imagenet-torch <model-zoo-resnext101-32x8d-imagenet-torch>`             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`resnext50-32x4d-imagenet-torch <model-zoo-resnext50-32x4d-imagenet-torch>`               | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`retinanet-resnet50-fpn-coco-torch <model-zoo-retinanet-resnet50-fpn-coco-torch>`         | detection, coco, torch                      |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`shufflenetv2-0.5x-imagenet-torch <model-zoo-shufflenetv2-0.5x-imagenet-torch>`           | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`shufflenetv2-1.0x-imagenet-torch <model-zoo-shufflenetv2-1.0x-imagenet-torch>`           | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`squeezenet-1.1-imagenet-torch <model-zoo-squeezenet-1.1-imagenet-torch>`                 | classification, imagenet, torch             |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`squeezenet-imagenet-torch <model-zoo-squeezenet-imagenet-torch>`                         | classification, imagenet, torch             |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`vgg11-bn-imagenet-torch <model-zoo-vgg11-bn-imagenet-torch>`                             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`vgg11-imagenet-torch <model-zoo-vgg11-imagenet-torch>`                                   | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`vgg13-bn-imagenet-torch <model-zoo-vgg13-bn-imagenet-torch>`                             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`vgg13-imagenet-torch <model-zoo-vgg13-imagenet-torch>`                                   | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`vgg16-bn-imagenet-torch <model-zoo-vgg16-bn-imagenet-torch>`                             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`vgg16-imagenet-torch <model-zoo-vgg16-imagenet-torch>`                                   | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`vgg19-bn-imagenet-torch <model-zoo-vgg19-bn-imagenet-torch>`                             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`vgg19-imagenet-torch <model-zoo-vgg19-imagenet-torch>`                                   | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`wide-resnet101-2-imagenet-torch <model-zoo-wide-resnet101-2-imagenet-torch>`             | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+
    | :ref:`wide-resnet50-2-imagenet-torch <model-zoo-wide-resnet50-2-imagenet-torch>`               | classification, embeddings, imagenet, torch |
    +------------------------------------------------------------------------------------------------+---------------------------------------------+


.. _model-zoo-alexnet-imagenet-torch:

alexnet-imagenet-torch
______________________

AlexNet model architecture from `One weird trick for parallelizing convolutional neural networks <https://arxiv.org/abs/1404.5997>`_ trained on ImageNet.

**Details**

-   Model name: ``alexnet-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 233.10 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("alexnet-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-deeplabv3-resnet101-coco-torch:

deeplabv3-resnet101-coco-torch
______________________________

DeepLabV3 model from `Rethinking Atrous Convolution for Semantic Image Segmentation <https://arxiv.org/abs/1706.05587>`_ with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``deeplabv3-resnet101-coco-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 233.22 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("deeplabv3-resnet101-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-deeplabv3-resnet50-coco-torch:

deeplabv3-resnet50-coco-torch
_____________________________

DeepLabV3 model from `Rethinking Atrous Convolution for Semantic Image Segmentation <https://arxiv.org/abs/1706.05587>`_ with ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``deeplabv3-resnet50-coco-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 160.51 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("deeplabv3-resnet50-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-densenet121-imagenet-torch:

densenet121-imagenet-torch
__________________________

Densenet-121 model from `Densely Connected Convolutional Networks <https://arxiv.org/pdf/1608.06993.pdf>`_ trained on ImageNet.

**Details**

-   Model name: ``densenet121-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 30.84 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("densenet121-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-densenet161-imagenet-torch:

densenet161-imagenet-torch
__________________________

Densenet-161 model from `Densely Connected Convolutional Networks <https://arxiv.org/pdf/1608.06993.pdf>`_ trained on ImageNet.

**Details**

-   Model name: ``densenet161-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 110.37 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("densenet161-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-densenet169-imagenet-torch:

densenet169-imagenet-torch
__________________________

Densenet-169 model from `Densely Connected Convolutional Networks <https://arxiv.org/pdf/1608.06993.pdf>`_ trained on ImageNet.

**Details**

-   Model name: ``densenet169-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 54.71 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("densenet169-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-densenet201-imagenet-torch:

densenet201-imagenet-torch
__________________________

Densenet-201 model from `Densely Connected Convolutional Networks <https://arxiv.org/pdf/1608.06993.pdf>`_ trained on ImageNet.

**Details**

-   Model name: ``densenet201-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 77.37 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("densenet201-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-resnet50-fpn-coco-torch:

faster-rcnn-resnet50-fpn-coco-torch
___________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with ResNet-50 FPN backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet50-fpn-coco-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 159.74 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-fcn-resnet101-coco-torch:

fcn-resnet101-coco-torch
________________________

FCN model from `Fully Convolutional Networks for Semantic Segmentation <https://arxiv.org/abs/1411.4038>`_ with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``fcn-resnet101-coco-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 207.71 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("fcn-resnet101-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-fcn-resnet50-coco-torch:

fcn-resnet50-coco-torch
_______________________

FCN model from `Fully Convolutional Networks for Semantic Segmentation <https://arxiv.org/abs/1411.4038>`_ with ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``fcn-resnet50-coco-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 135.01 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("fcn-resnet50-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-googlenet-imagenet-torch:

googlenet-imagenet-torch
________________________

GoogLeNet (Inception v1) model from `Going Deeper with Convolutions <https://arxiv.org/abs/1409.4842>`_ trained on ImageNet.

**Details**

-   Model name: ``googlenet-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 49.73 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``scipy, torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("googlenet-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-inception-v3-imagenet-torch:

inception-v3-imagenet-torch
___________________________

Inception v3 model from `Rethinking the Inception Architecture for Computer Vision <https://arxiv.org/abs/1512.00567>`_ trained on ImageNet.

**Details**

-   Model name: ``inception-v3-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 103.81 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``scipy, torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("inception-v3-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-keypoint-rcnn-resnet50-fpn-coco-torch:

keypoint-rcnn-resnet50-fpn-coco-torch
_____________________________________

Keypoint R-CNN model from `Keypoint Density-based Region Proposal for Fine-Grained Object Detection and Classification using Regions with Convolutional Neural Network Features <https://arxiv.org/abs/1603.00502>`_ with ResNet-50 FPN backbone trained on COCO.

**Details**

-   Model name: ``keypoint-rcnn-resnet50-fpn-coco-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 226.05 MB
-   Exposes embeddings? no
-   Tags: ``keypoints, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("keypoint-rcnn-resnet50-fpn-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mask-rcnn-resnet50-fpn-coco-torch:

mask-rcnn-resnet50-fpn-coco-torch
_________________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ with ResNet-50 FPN backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-resnet50-fpn-coco-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 169.84 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mask-rcnn-resnet50-fpn-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mnasnet0.5-imagenet-torch:

mnasnet0.5-imagenet-torch
_________________________

MNASNet model from from `MnasNet: Platform-Aware Neural Architecture Search for Mobile <https://arxiv.org/abs/1807.11626>`_ with depth multiplier of 0.5 trained on ImageNet.

**Details**

-   Model name: ``mnasnet0.5-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 8.59 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mnasnet0.5-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mnasnet1.0-imagenet-torch:

mnasnet1.0-imagenet-torch
_________________________

MNASNet model from `MnasNet: Platform-Aware Neural Architecture Search for Mobile <https://arxiv.org/abs/1807.11626>`_ with depth multiplier of 1.0 trained on ImageNet.

**Details**

-   Model name: ``mnasnet1.0-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 16.92 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mnasnet1.0-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mobilenet-v2-imagenet-torch:

mobilenet-v2-imagenet-torch
___________________________

MobileNetV2 model from `MobileNetV2: Inverted Residuals and Linear Bottlenecks <https://arxiv.org/abs/1801.04381>`_ trained on ImageNet.

**Details**

-   Model name: ``mobilenet-v2-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 13.55 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mobilenet-v2-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnet101-imagenet-torch:

resnet101-imagenet-torch
________________________

ResNet-101 model from `Deep Residual Learning for Image Recognition <https://arxiv.org/abs/1512.03385>`_ trained on ImageNet.

**Details**

-   Model name: ``resnet101-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 170.45 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnet101-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnet152-imagenet-torch:

resnet152-imagenet-torch
________________________

ResNet-152 model from `Deep Residual Learning for Image Recognition <https://arxiv.org/abs/1512.03385>`_ trained on ImageNet.

**Details**

-   Model name: ``resnet152-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 230.34 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnet152-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnet18-imagenet-torch:

resnet18-imagenet-torch
_______________________

ResNet-18 model from `Deep Residual Learning for Image Recognition <https://arxiv.org/abs/1512.03385>`_ trained on ImageNet.

**Details**

-   Model name: ``resnet18-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 44.66 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnet18-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnet34-imagenet-torch:

resnet34-imagenet-torch
_______________________

ResNet-34 model from `Deep Residual Learning for Image Recognition <https://arxiv.org/abs/1512.03385>`_ trained on ImageNet.

**Details**

-   Model name: ``resnet34-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 83.26 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnet34-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnet50-imagenet-torch:

resnet50-imagenet-torch
_______________________

ResNet-50 model from `Deep Residual Learning for Image Recognition <https://arxiv.org/abs/1512.03385>`_ trained on ImageNet.

**Details**

-   Model name: ``resnet50-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 97.75 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnet50-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnext101-32x8d-imagenet-torch:

resnext101-32x8d-imagenet-torch
_______________________________

ResNeXt-101 32x8d model from `Aggregated Residual Transformations for Deep Neural Networks <https://arxiv.org/abs/1611.05431>`_ trained on ImageNet.

**Details**

-   Model name: ``resnext101-32x8d-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 339.59 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnext101-32x8d-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnext50-32x4d-imagenet-torch:

resnext50-32x4d-imagenet-torch
______________________________

ResNeXt-50 32x4d model from `Aggregated Residual Transformations for Deep Neural Networks <https://arxiv.org/abs/1611.05431>`_ trained on ImageNet.

**Details**

-   Model name: ``resnext50-32x4d-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 95.79 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnext50-32x4d-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-retinanet-resnet50-fpn-coco-torch:

retinanet-resnet50-fpn-coco-torch
_________________________________

RetinaNet model from `Focal Loss for Dense Object Detection <https://arxiv.org/abs/1708.02002>`_ with ResNet-50 FPN backbone trained on COCO.

**Details**

-   Model name: ``retinanet-resnet50-fpn-coco-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 130.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision>=0.8.0``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("retinanet-resnet50-fpn-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-shufflenetv2-0.5x-imagenet-torch:

shufflenetv2-0.5x-imagenet-torch
________________________________

ShuffleNetV2 model from `ShuffleNet V2: Practical Guidelines for Efficient CNN Architecture Design <https://arxiv.org/abs/1807.11164>`_ with 0.5x output channels trained on ImageNet.

**Details**

-   Model name: ``shufflenetv2-0.5x-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 5.28 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("shufflenetv2-0.5x-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-shufflenetv2-1.0x-imagenet-torch:

shufflenetv2-1.0x-imagenet-torch
________________________________

ShuffleNetV2 model from `ShuffleNet V2: Practical Guidelines for Efficient CNN Architecture Design <https://arxiv.org/abs/1807.11164>`_ with 1.0x output channels trained on ImageNet.

**Details**

-   Model name: ``shufflenetv2-1.0x-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 8.79 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("shufflenetv2-1.0x-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-squeezenet-1.1-imagenet-torch:

squeezenet-1.1-imagenet-torch
_____________________________

SqueezeNet 1.1 model from `the official SqueezeNet repo <https://github.com/forresti/SqueezeNet/tree/master/SqueezeNet_v1.1>`_ trained on ImageNet.

**Details**

-   Model name: ``squeezenet-1.1-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 4.74 MB
-   Exposes embeddings? no
-   Tags: ``classification, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("squeezenet-1.1-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-squeezenet-imagenet-torch:

squeezenet-imagenet-torch
_________________________

SqueezeNet model from `SqueezeNet: AlexNet-level accuracy with 50x fewer parameters and <0.5MB model size <https://arxiv.org/abs/1602.07360>`_ trained on ImageNet.

**Details**

-   Model name: ``squeezenet-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 4.79 MB
-   Exposes embeddings? no
-   Tags: ``classification, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("squeezenet-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg11-bn-imagenet-torch:

vgg11-bn-imagenet-torch
_______________________

VGG-11 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ with batch normalization trained on ImageNet.

**Details**

-   Model name: ``vgg11-bn-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 506.88 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg11-bn-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg11-imagenet-torch:

vgg11-imagenet-torch
____________________

VGG-11 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ trained on ImageNet.

**Details**

-   Model name: ``vgg11-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 506.84 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg11-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg13-bn-imagenet-torch:

vgg13-bn-imagenet-torch
_______________________

VGG-13 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ with batch normalization trained on ImageNet.

**Details**

-   Model name: ``vgg13-bn-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 507.59 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg13-bn-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg13-imagenet-torch:

vgg13-imagenet-torch
____________________

VGG-13 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ trained on ImageNet.

**Details**

-   Model name: ``vgg13-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 507.54 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg13-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg16-bn-imagenet-torch:

vgg16-bn-imagenet-torch
_______________________

VGG-16 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ with batch normalization trained on ImageNet.

**Details**

-   Model name: ``vgg16-bn-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 527.87 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg16-bn-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg16-imagenet-torch:

vgg16-imagenet-torch
____________________

VGG-16 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ trained on ImageNet.

**Details**

-   Model name: ``vgg16-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 527.80 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg16-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg19-bn-imagenet-torch:

vgg19-bn-imagenet-torch
_______________________

VGG-19 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ with batch normalization trained on ImageNet.

**Details**

-   Model name: ``vgg19-bn-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 548.14 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg19-bn-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg19-imagenet-torch:

vgg19-imagenet-torch
____________________

VGG-19 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ trained on ImageNet.

**Details**

-   Model name: ``vgg19-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 548.05 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg19-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-wide-resnet101-2-imagenet-torch:

wide-resnet101-2-imagenet-torch
_______________________________

Wide ResNet-101-2 model from `Wide Residual Networks <https://arxiv.org/abs/1605.07146>`_ trained on ImageNet.

**Details**

-   Model name: ``wide-resnet101-2-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 242.90 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("wide-resnet101-2-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-wide-resnet50-2-imagenet-torch:

wide-resnet50-2-imagenet-torch
______________________________

Wide ResNet-50-2 model from `Wide Residual Networks <https://arxiv.org/abs/1605.07146>`_ trained on ImageNet.

**Details**

-   Model name: ``wide-resnet50-2-imagenet-torch``
-   Model source: https://pytorch.org/docs/stable/torchvision/models.html
-   Model size: 131.82 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU

    -   Support? yes

-   GPU

    -   Support? yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("wide-resnet50-2-imagenet-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-tensorflow-models:

TensorFlow models
-----------------

Available models
________________

.. table::
    :widths: 40 60

    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | Model name                                                                                                                                   | Tags                                      |
    +==============================================================================================================================================+===========================================+
    | :ref:`deeplabv3-cityscapes-tf <model-zoo-deeplabv3-cityscapes-tf>`                                                                           | segmentation, cityscapes, tf              |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`deeplabv3-mnv2-cityscapes-tf <model-zoo-deeplabv3-mnv2-cityscapes-tf>`                                                                 | segmentation, cityscapes, tf              |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`efficientdet-d0-coco-tf1 <model-zoo-efficientdet-d0-coco-tf1>`                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`efficientdet-d1-coco-tf1 <model-zoo-efficientdet-d1-coco-tf1>`                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`efficientdet-d2-coco-tf1 <model-zoo-efficientdet-d2-coco-tf1>`                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`efficientdet-d3-coco-tf1 <model-zoo-efficientdet-d3-coco-tf1>`                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`efficientdet-d4-coco-tf1 <model-zoo-efficientdet-d4-coco-tf1>`                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`efficientdet-d5-coco-tf1 <model-zoo-efficientdet-d5-coco-tf1>`                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`efficientdet-d6-coco-tf1 <model-zoo-efficientdet-d6-coco-tf1>`                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-inception-resnet-atrous-v2-coco-tf1 <model-zoo-faster-rcnn-inception-resnet-atrous-v2-coco-tf1>`                           | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf1 <model-zoo-faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf1>` | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-inception-v2-coco-tf1 <model-zoo-faster-rcnn-inception-v2-coco-tf1>`                                                       | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-nas-coco-tf1 <model-zoo-faster-rcnn-nas-coco-tf1>`                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-nas-lowproposals-coco-tf1 <model-zoo-faster-rcnn-nas-lowproposals-coco-tf1>`                                               | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-resnet101-coco-tf1 <model-zoo-faster-rcnn-resnet101-coco-tf1>`                                                             | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-resnet101-lowproposals-coco-tf1 <model-zoo-faster-rcnn-resnet101-lowproposals-coco-tf1>`                                   | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-resnet50-coco-tf1 <model-zoo-faster-rcnn-resnet50-coco-tf1>`                                                               | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`faster-rcnn-resnet50-lowproposals-coco-tf1 <model-zoo-faster-rcnn-resnet50-lowproposals-coco-tf1>`                                     | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`inception-resnet-v2-imagenet-tf1 <model-zoo-inception-resnet-v2-imagenet-tf1>`                                                         | classification, embeddings, imagenet, tf1 |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`inception-v4-imagenet-tf1 <model-zoo-inception-v4-imagenet-tf1>`                                                                       | classification, embeddings, imagenet, tf1 |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`mask-rcnn-inception-resnet-v2-atrous-coco-tf1 <model-zoo-mask-rcnn-inception-resnet-v2-atrous-coco-tf1>`                               | instances, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`mask-rcnn-inception-v2-coco-tf1 <model-zoo-mask-rcnn-inception-v2-coco-tf1>`                                                           | instances, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`mask-rcnn-resnet101-atrous-coco-tf1 <model-zoo-mask-rcnn-resnet101-atrous-coco-tf1>`                                                   | instances, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`mask-rcnn-resnet50-atrous-coco-tf1 <model-zoo-mask-rcnn-resnet50-atrous-coco-tf1>`                                                     | instances, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`mobilenet-v2-imagenet-tf1 <model-zoo-mobilenet-v2-imagenet-tf1>`                                                                       | classification, embeddings, imagenet, tf1 |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`resnet-v1-50-imagenet-tf1 <model-zoo-resnet-v1-50-imagenet-tf1>`                                                                       | classification, embeddings, imagenet, tf1 |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`resnet-v2-50-imagenet-tf1 <model-zoo-resnet-v2-50-imagenet-tf1>`                                                                       | classification, embeddings, imagenet, tf1 |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`rfcn-resnet101-coco-tf1 <model-zoo-rfcn-resnet101-coco-tf1>`                                                                           | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`ssd-inception-v2-coco-tf1 <model-zoo-ssd-inception-v2-coco-tf1>`                                                                       | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`ssd-mobilenet-v1-coco-tf1 <model-zoo-ssd-mobilenet-v1-coco-tf1>`                                                                       | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`ssd-mobilenet-v1-fpn-coco-tf1 <model-zoo-ssd-mobilenet-v1-fpn-coco-tf1>`                                                               | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`ssd-resnet50-fpn-coco-tf1 <model-zoo-ssd-resnet50-fpn-coco-tf1>`                                                                       | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`vgg16-imagenet-tf <model-zoo-vgg16-imagenet-tf>`                                                                                       | classification, embeddings, imagenet, tf  |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+
    | :ref:`yolo-v2-coco-tf1 <model-zoo-yolo-v2-coco-tf1>`                                                                                         | detection, coco, tf1                      |
    +----------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------------------+


.. _model-zoo-deeplabv3-cityscapes-tf:

deeplabv3-cityscapes-tf
_______________________

DeepLabv3+ semantic segmentation model from `Encoder-Decoder with Atrous Separable Convolution for Semantic Image Segmentation <https://arxiv.org/abs/1802.02611>`_ with Xception backbone trained on the Cityscapes dataset.

**Details**

-   Model name: ``deeplabv3-cityscapes-tf``
-   Model source: https://github.com/tensorflow/models/blob/master/research/deeplab/g3doc/model_zoo.md
-   Model size: 158.04 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, cityscapes, tf``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("deeplabv3-cityscapes-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-deeplabv3-mnv2-cityscapes-tf:

deeplabv3-mnv2-cityscapes-tf
____________________________

DeepLabv3+ semantic segmentation model from `Encoder-Decoder with Atrous Separable Convolution for Semantic Image Segmentation <https://arxiv.org/abs/1802.02611>`_ with MobileNetV2 backbone trained on the Cityscapes dataset.

**Details**

-   Model name: ``deeplabv3-mnv2-cityscapes-tf``
-   Model source: https://github.com/tensorflow/models/blob/master/research/deeplab/g3doc/model_zoo.md
-   Model size: 8.37 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, cityscapes, tf``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("deeplabv3-mnv2-cityscapes-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-efficientdet-d0-coco-tf1:

efficientdet-d0-coco-tf1
________________________

EfficientDet-D0 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d0-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 17.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu>=1.14,<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("efficientdet-d0-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-efficientdet-d1-coco-tf1:

efficientdet-d1-coco-tf1
________________________

EfficientDet-D1 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d1-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 17.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu>=1.14,<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("efficientdet-d1-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-efficientdet-d2-coco-tf1:

efficientdet-d2-coco-tf1
________________________

EfficientDet-D2 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d2-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 17.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu>=1.14,<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("efficientdet-d2-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-efficientdet-d3-coco-tf1:

efficientdet-d3-coco-tf1
________________________

EfficientDet-D3 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d3-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 17.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu>=1.14,<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("efficientdet-d3-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-efficientdet-d4-coco-tf1:

efficientdet-d4-coco-tf1
________________________

EfficientDet-D4 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d4-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 17.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu>=1.14,<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("efficientdet-d4-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-efficientdet-d5-coco-tf1:

efficientdet-d5-coco-tf1
________________________

EfficientDet-D5 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d5-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 17.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu>=1.14,<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("efficientdet-d5-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-efficientdet-d6-coco-tf1:

efficientdet-d6-coco-tf1
________________________

EfficientDet-D6 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d6-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 17.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu>=1.14,<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("efficientdet-d6-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-inception-resnet-atrous-v2-coco-tf1:

faster-rcnn-inception-resnet-atrous-v2-coco-tf1
_______________________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ atrous version with Inception backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-inception-resnet-atrous-v2-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 234.46 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-inception-resnet-atrous-v2-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf1:

faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf1
____________________________________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ atrous version with low-proposals and Inception backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 234.46 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-inception-v2-coco-tf1:

faster-rcnn-inception-v2-coco-tf1
_________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with Inception v2 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-inception-v2-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 52.97 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-inception-v2-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-nas-coco-tf1:

faster-rcnn-nas-coco-tf1
________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with NAS-net backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-nas-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 404.95 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-nas-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-nas-lowproposals-coco-tf1:

faster-rcnn-nas-lowproposals-coco-tf1
_____________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with low-proposals and NAS-net backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-nas-lowproposals-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 404.88 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-nas-lowproposals-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-resnet101-coco-tf1:

faster-rcnn-resnet101-coco-tf1
______________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet101-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 186.41 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-resnet101-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-resnet101-lowproposals-coco-tf1:

faster-rcnn-resnet101-lowproposals-coco-tf1
___________________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with low-proposals and ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet101-lowproposals-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 186.41 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-resnet101-lowproposals-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-resnet50-coco-tf1:

faster-rcnn-resnet50-coco-tf1
_____________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet50-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 113.57 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-resnet50-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-faster-rcnn-resnet50-lowproposals-coco-tf1:

faster-rcnn-resnet50-lowproposals-coco-tf1
__________________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with low-proposals and ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet50-lowproposals-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 113.57 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("faster-rcnn-resnet50-lowproposals-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-inception-resnet-v2-imagenet-tf1:

inception-resnet-v2-imagenet-tf1
________________________________

Inception v2 model from `Rethinking the Inception Architecture for Computer Vision <https://arxiv.org/abs/1512.00567>`_ trained on ImageNet.

**Details**

-   Model name: ``inception-resnet-v2-imagenet-tf1``
-   Model source: https://github.com/tensorflow/models/tree/archive/research/slim#pre-trained-models
-   Model size: 213.81 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("inception-resnet-v2-imagenet-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-inception-v4-imagenet-tf1:

inception-v4-imagenet-tf1
_________________________

Inception v4 model from `Inception-v4, Inception-ResNet and the Impact of Residual Connections on Learning <https://arxiv.org/abs/1602.07261>`_ trained on ImageNet.

**Details**

-   Model name: ``inception-v4-imagenet-tf1``
-   Model source: https://github.com/tensorflow/models/tree/archive/research/slim#pre-trained-models
-   Model size: 163.31 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("inception-v4-imagenet-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mask-rcnn-inception-resnet-v2-atrous-coco-tf1:

mask-rcnn-inception-resnet-v2-atrous-coco-tf1
_____________________________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ atrous version with Inception backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-inception-resnet-v2-atrous-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 254.51 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mask-rcnn-inception-resnet-v2-atrous-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mask-rcnn-inception-v2-coco-tf1:

mask-rcnn-inception-v2-coco-tf1
_______________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ with Inception backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-inception-v2-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 64.03 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mask-rcnn-inception-v2-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mask-rcnn-resnet101-atrous-coco-tf1:

mask-rcnn-resnet101-atrous-coco-tf1
___________________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ atrous version with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-resnet101-atrous-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 211.56 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mask-rcnn-resnet101-atrous-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mask-rcnn-resnet50-atrous-coco-tf1:

mask-rcnn-resnet50-atrous-coco-tf1
__________________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ atrous version with ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-resnet50-atrous-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 138.29 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mask-rcnn-resnet50-atrous-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-mobilenet-v2-imagenet-tf1:

mobilenet-v2-imagenet-tf1
_________________________

MobileNetV2 model from `MobileNetV2: Inverted Residuals and Linear Bottlenecks <https://arxiv.org/abs/1801.04381>`_ trained on ImageNet.

**Details**

-   Model name: ``mobilenet-v2-imagenet-tf1``
-   Model source: None
-   Model size: 13.64 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("mobilenet-v2-imagenet-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnet-v1-50-imagenet-tf1:

resnet-v1-50-imagenet-tf1
_________________________

ResNet-50 v1 model from `Deep Residual Learning for Image Recognition <https://arxiv.org/abs/1512.03385>`_ trained on ImageNet.

**Details**

-   Model name: ``resnet-v1-50-imagenet-tf1``
-   Model source: https://github.com/tensorflow/models/tree/archive/research/slim#pre-trained-models
-   Model size: 97.84 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnet-v1-50-imagenet-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-resnet-v2-50-imagenet-tf1:

resnet-v2-50-imagenet-tf1
_________________________

ResNet-50 v2 model from `Deep Residual Learning for Image Recognition <https://arxiv.org/abs/1512.03385>`_ trained on ImageNet.

**Details**

-   Model name: ``resnet-v2-50-imagenet-tf1``
-   Model source: https://github.com/tensorflow/models/tree/archive/research/slim#pre-trained-models
-   Model size: 97.86 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("resnet-v2-50-imagenet-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-rfcn-resnet101-coco-tf1:

rfcn-resnet101-coco-tf1
_______________________

R-FCN object detection model from `R-FCN: Object Detection via Region-based Fully Convolutional Networks <https://arxiv.org/abs/1605.06409>`_ with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``rfcn-resnet101-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 208.16 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("rfcn-resnet101-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-ssd-inception-v2-coco-tf1:

ssd-inception-v2-coco-tf1
_________________________

Inception Single Shot Detector model from `SSD: Single Shot MultiBox Detector <https://arxiv.org/abs/1512.02325>`_ trained on COCO.

**Details**

-   Model name: ``ssd-inception-v2-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 97.50 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("ssd-inception-v2-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-ssd-mobilenet-v1-coco-tf1:

ssd-mobilenet-v1-coco-tf1
_________________________

Single Shot Detector model from `SSD: Single Shot MultiBox Detector <https://arxiv.org/abs/1512.02325>`_ with MobileNet-v1 backbone trained on COCO.

**Details**

-   Model name: ``ssd-mobilenet-v1-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 27.83 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("ssd-mobilenet-v1-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-ssd-mobilenet-v1-fpn-coco-tf1:

ssd-mobilenet-v1-fpn-coco-tf1
_____________________________

FPN Single Shot Detector model from `SSD: Single Shot MultiBox Detector <https://arxiv.org/abs/1512.02325>`_ with MobileNet-v1 backbone trained on COCO.

**Details**

-   Model name: ``ssd-mobilenet-v1-fpn-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 48.97 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("ssd-mobilenet-v1-fpn-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-ssd-resnet50-fpn-coco-tf1:

ssd-resnet50-fpn-coco-tf1
_________________________

FPN Single Shot Detector model from `SSD: Single Shot MultiBox Detector <https://arxiv.org/abs/1512.02325>`_ with ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``ssd-resnet50-fpn-coco-tf1``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 128.07 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("ssd-resnet50-fpn-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-vgg16-imagenet-tf:

vgg16-imagenet-tf
_________________

VGG-16 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ trained on ImageNet.

**Details**

-   Model name: ``vgg16-imagenet-tf``
-   Model source: https://gist.github.com/ksimonyan/211839e770f7b538e2d8#file-readme-md
-   Model size: 527.80 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, imagenet, tf``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("vgg16-imagenet-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

.. _model-zoo-yolo-v2-coco-tf1:

yolo-v2-coco-tf1
________________

YOLOv2 model from `YOLO9000: Better, Faster, Stronger <https://arxiv.org/abs/1612.08242>`_ trained on COCO.

**Details**

-   Model name: ``yolo-v2-coco-tf1``
-   Model source: https://github.com/thtrieu/darkflow
-   Model size: 194.49 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU

    -   Support? yes
    -   Packages: ``tensorflow<2``

-   GPU

    -   Support? yes
    -   Packages: ``tensorflow-gpu<2``

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("yolo-v2-coco-tf1")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)
