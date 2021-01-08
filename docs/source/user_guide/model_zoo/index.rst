
.. _model-zoo:

FiftyOne Model Zoo
==================

.. default-role:: code

FiftyOne provides a Model Zoo that contains a collection of pre-trained models
that you can download and run inference on your FiftyOne Datasets via a few
simple commands.

.. note::

    Zoo models may require additional packages such as TensorFlow or PyTorch
    (or specific versions of them) in order to be used. See
    :ref:`this section <model-zoo-requirements>` for more information on
    viewing/installing package requirements for models.

    If you try to load a zoo model without the proper packages installed, you
    will receive an error message that will explain what you need to install.

    Depending on your compute environment, some package requirement failures
    may be erroneous. In such cases, you can
    :ref:`suppress error messages <model-zoo-load>`.


.. Model zoo cards section -------------------------------------------------------

.. raw:: html

    <div id="tutorial-cards-container">

    <nav class="navbar navbar-expand-lg navbar-light tutorials-nav col-12">
        <div class="tutorial-tags-container">
            <div id="dropdown-filter-tags">
                <div class="tutorial-filter-menu">
                    <div class="tutorial-filter filter-btn all-tag-selected" data-tag="all">All</div>
                </div>
            </div>
        </div>
    </nav>

    <hr class="tutorials-hr">

    <div class="row">

    <div id="tutorial-cards">
    <div class="list">

.. Add model zoo cards below

.. customcarditem::
    :header: alexnet-imagenet-torch
    :description: AlexNet model architecture from `One weird trick for parallelizing convolutional neural networks ` trained on ImageNet
    :link: models.html#alexnet-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: centernet-hg104-512-coco-tf2
    :description: CenterNet model from `Objects as Points ` with the Hourglass-104 backbone trained on COCO resized to 512x512
    :link: models.html#centernet-hg104-512-coco-tf2
    :tags: Detection,Coco,TensorFlow 2

.. customcarditem::
    :header: deeplabv3-cityscapes-tf
    :description: DeepLabv3+ semantic segmentation model from `Encoder-Decoder with Atrous Separable Convolution for Semantic Image Segmentation ` with Xception backbone trained on the Cityscapes dataset
    :link: models.html#deeplabv3-cityscapes-tf
    :tags: Segmentation,Cityscapes,TensorFlow

.. customcarditem::
    :header: deeplabv3-mnv2-cityscapes-tf
    :description: DeepLabv3+ semantic segmentation model from `Encoder-Decoder with Atrous Separable Convolution for Semantic Image Segmentation ` with MobileNetV2 backbone trained on the Cityscapes dataset
    :link: models.html#deeplabv3-mnv2-cityscapes-tf
    :tags: Segmentation,Cityscapes,TensorFlow

.. customcarditem::
    :header: deeplabv3-resnet101-coco-torch
    :description: DeepLabV3 model from `Rethinking Atrous Convolution for Semantic Image Segmentation ` with ResNet-101 backbone trained on COCO
    :link: models.html#deeplabv3-resnet101-coco-torch
    :tags: Segmentation,Coco,PyTorch

.. customcarditem::
    :header: deeplabv3-resnet50-coco-torch
    :description: DeepLabV3 model from `Rethinking Atrous Convolution for Semantic Image Segmentation ` with ResNet-50 backbone trained on COCO
    :link: models.html#deeplabv3-resnet50-coco-torch
    :tags: Segmentation,Coco,PyTorch

.. customcarditem::
    :header: densenet121-imagenet-torch
    :description: Densenet-121 model from `Densely Connected Convolutional Networks ` trained on ImageNet
    :link: models.html#densenet121-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: densenet161-imagenet-torch
    :description: Densenet-161 model from `Densely Connected Convolutional Networks ` trained on ImageNet
    :link: models.html#densenet161-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: densenet169-imagenet-torch
    :description: Densenet-169 model from `Densely Connected Convolutional Networks ` trained on ImageNet
    :link: models.html#densenet169-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: densenet201-imagenet-torch
    :description: Densenet-201 model from `Densely Connected Convolutional Networks ` trained on ImageNet
    :link: models.html#densenet201-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: efficientdet-d0-coco-tf1
    :description: EfficientDet-D0 model from `EfficientDet: Scalable and Efficient Object Detection ` trained on COCO
    :link: models.html#efficientdet-d0-coco-tf1
    :tags: Detection,Coco,TensorFlow 1

.. customcarditem::
    :header: efficientdet-d1-coco-tf1
    :description: EfficientDet-D1 model from `EfficientDet: Scalable and Efficient Object Detection ` trained on COCO
    :link: models.html#efficientdet-d1-coco-tf1
    :tags: Detection,Coco,TensorFlow 1

.. customcarditem::
    :header: efficientdet-d2-coco-tf1
    :description: EfficientDet-D2 model from `EfficientDet: Scalable and Efficient Object Detection ` trained on COCO
    :link: models.html#efficientdet-d2-coco-tf1
    :tags: Detection,Coco,TensorFlow 1

.. customcarditem::
    :header: efficientdet-d3-coco-tf1
    :description: EfficientDet-D3 model from `EfficientDet: Scalable and Efficient Object Detection ` trained on COCO
    :link: models.html#efficientdet-d3-coco-tf1
    :tags: Detection,Coco,TensorFlow 1

.. customcarditem::
    :header: efficientdet-d4-coco-tf1
    :description: EfficientDet-D4 model from `EfficientDet: Scalable and Efficient Object Detection ` trained on COCO
    :link: models.html#efficientdet-d4-coco-tf1
    :tags: Detection,Coco,TensorFlow 1

.. customcarditem::
    :header: efficientdet-d5-coco-tf1
    :description: EfficientDet-D5 model from `EfficientDet: Scalable and Efficient Object Detection ` trained on COCO
    :link: models.html#efficientdet-d5-coco-tf1
    :tags: Detection,Coco,TensorFlow 1

.. customcarditem::
    :header: efficientdet-d6-coco-tf1
    :description: EfficientDet-D6 model from `EfficientDet: Scalable and Efficient Object Detection ` trained on COCO
    :link: models.html#efficientdet-d6-coco-tf1
    :tags: Detection,Coco,TensorFlow 1

.. customcarditem::
    :header: faster-rcnn-inception-resnet-atrous-v2-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` atrous version with Inception backbone trained on COCO
    :link: models.html#faster-rcnn-inception-resnet-atrous-v2-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` atrous version with low-proposals and Inception backbone trained on COCO
    :link: models.html#faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-inception-v2-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` with Inception v2 backbone trained on COCO
    :link: models.html#faster-rcnn-inception-v2-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-nas-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` with NAS-net backbone trained on COCO
    :link: models.html#faster-rcnn-nas-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-nas-lowproposals-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` with low-proposals and NAS-net backbone trained on COCO
    :link: models.html#faster-rcnn-nas-lowproposals-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-resnet101-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` with ResNet-101 backbone trained on COCO
    :link: models.html#faster-rcnn-resnet101-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-resnet101-lowproposals-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` with low-proposals and ResNet-101 backbone trained on COCO
    :link: models.html#faster-rcnn-resnet101-lowproposals-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-resnet50-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` with ResNet-50 backbone trained on COCO
    :link: models.html#faster-rcnn-resnet50-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-resnet50-fpn-coco-torch
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` with ResNet-50 FPN backbone trained on COCO
    :link: models.html#faster-rcnn-resnet50-fpn-coco-torch
    :tags: Detection,Coco,PyTorch

.. customcarditem::
    :header: faster-rcnn-resnet50-lowproposals-coco-tf
    :description: Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks ` with low-proposals and ResNet-50 backbone trained on COCO
    :link: models.html#faster-rcnn-resnet50-lowproposals-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: fcn-resnet101-coco-torch
    :description: FCN model from `Fully Convolutional Networks for Semantic Segmentation ` with ResNet-101 backbone trained on COCO
    :link: models.html#fcn-resnet101-coco-torch
    :tags: Segmentation,Coco,PyTorch

.. customcarditem::
    :header: fcn-resnet50-coco-torch
    :description: FCN model from `Fully Convolutional Networks for Semantic Segmentation ` with ResNet-50 backbone trained on COCO
    :link: models.html#fcn-resnet50-coco-torch
    :tags: Segmentation,Coco,PyTorch

.. customcarditem::
    :header: googlenet-imagenet-torch
    :description: GoogLeNet (Inception v1) model from `Going Deeper with Convolutions ` trained on ImageNet
    :link: models.html#googlenet-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: inception-resnet-v2-imagenet-tf1
    :description: Inception v2 model from `Rethinking the Inception Architecture for Computer Vision ` trained on ImageNet
    :link: models.html#inception-resnet-v2-imagenet-tf1
    :tags: Classification,Embeddings,Imagenet,TensorFlow 1

.. customcarditem::
    :header: inception-v3-imagenet-torch
    :description: Inception v3 model from `Rethinking the Inception Architecture for Computer Vision ` trained on ImageNet
    :link: models.html#inception-v3-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: inception-v4-imagenet-tf1
    :description: Inception v4 model from `Inception-v4, Inception-ResNet and the Impact of Residual Connections on Learning ` trained on ImageNet
    :link: models.html#inception-v4-imagenet-tf1
    :tags: Classification,Embeddings,Imagenet,TensorFlow 1

.. customcarditem::
    :header: keypoint-rcnn-resnet50-fpn-coco-torch
    :description: Keypoint R-CNN model from `Keypoint Density-based Region Proposal for Fine-Grained Object Detection and Classification using Regions with Convolutional Neural Network Features ` with ResNet-50 FPN backbone trained on COCO
    :link: models.html#keypoint-rcnn-resnet50-fpn-coco-torch
    :tags: Keypoints,Coco,PyTorch

.. customcarditem::
    :header: mask-rcnn-inception-resnet-v2-atrous-coco-tf
    :description: Mask R-CNN model from `Mask R-CNN ` atrous version with Inception backbone trained on COCO
    :link: models.html#mask-rcnn-inception-resnet-v2-atrous-coco-tf
    :tags: Instances,Coco,TensorFlow

.. customcarditem::
    :header: mask-rcnn-inception-v2-coco-tf
    :description: Mask R-CNN model from `Mask R-CNN ` with Inception backbone trained on COCO
    :link: models.html#mask-rcnn-inception-v2-coco-tf
    :tags: Instances,Coco,TensorFlow

.. customcarditem::
    :header: mask-rcnn-resnet101-atrous-coco-tf
    :description: Mask R-CNN model from `Mask R-CNN ` atrous version with ResNet-101 backbone trained on COCO
    :link: models.html#mask-rcnn-resnet101-atrous-coco-tf
    :tags: Instances,Coco,TensorFlow

.. customcarditem::
    :header: mask-rcnn-resnet50-atrous-coco-tf
    :description: Mask R-CNN model from `Mask R-CNN ` atrous version with ResNet-50 backbone trained on COCO
    :link: models.html#mask-rcnn-resnet50-atrous-coco-tf
    :tags: Instances,Coco,TensorFlow

.. customcarditem::
    :header: mask-rcnn-resnet50-fpn-coco-torch
    :description: Mask R-CNN model from `Mask R-CNN ` with ResNet-50 FPN backbone trained on COCO
    :link: models.html#mask-rcnn-resnet50-fpn-coco-torch
    :tags: Instances,Coco,PyTorch

.. customcarditem::
    :header: mnasnet0.5-imagenet-torch
    :description: MNASNet model from from `MnasNet: Platform-Aware Neural Architecture Search for Mobile ` with depth multiplier of 0.5 trained on ImageNet
    :link: models.html#mnasnet0.5-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: mnasnet1.0-imagenet-torch
    :description: MNASNet model from `MnasNet: Platform-Aware Neural Architecture Search for Mobile ` with depth multiplier of 1.0 trained on ImageNet
    :link: models.html#mnasnet1.0-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: mobilenet-v2-imagenet-tf1
    :description: MobileNetV2 model from `MobileNetV2: Inverted Residuals and Linear Bottlenecks ` trained on ImageNet
    :link: models.html#mobilenet-v2-imagenet-tf1
    :tags: Classification,Embeddings,Imagenet,TensorFlow 1

.. customcarditem::
    :header: mobilenet-v2-imagenet-torch
    :description: MobileNetV2 model from `MobileNetV2: Inverted Residuals and Linear Bottlenecks ` trained on ImageNet
    :link: models.html#mobilenet-v2-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: resnet-v1-50-imagenet-tf1
    :description: ResNet-50 v1 model from `Deep Residual Learning for Image Recognition ` trained on ImageNet
    :link: models.html#resnet-v1-50-imagenet-tf1
    :tags: Classification,Embeddings,Imagenet,TensorFlow 1

.. customcarditem::
    :header: resnet-v2-50-imagenet-tf1
    :description: ResNet-50 v2 model from `Deep Residual Learning for Image Recognition ` trained on ImageNet
    :link: models.html#resnet-v2-50-imagenet-tf1
    :tags: Classification,Embeddings,Imagenet,TensorFlow 1

.. customcarditem::
    :header: resnet101-imagenet-torch
    :description: ResNet-101 model from `Deep Residual Learning for Image Recognition ` trained on ImageNet
    :link: models.html#resnet101-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: resnet152-imagenet-torch
    :description: ResNet-152 model from `Deep Residual Learning for Image Recognition ` trained on ImageNet
    :link: models.html#resnet152-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: resnet18-imagenet-torch
    :description: ResNet-18 model from `Deep Residual Learning for Image Recognition ` trained on ImageNet
    :link: models.html#resnet18-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: resnet34-imagenet-torch
    :description: ResNet-34 model from `Deep Residual Learning for Image Recognition ` trained on ImageNet
    :link: models.html#resnet34-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: resnet50-imagenet-torch
    :description: ResNet-50 model from `Deep Residual Learning for Image Recognition ` trained on ImageNet
    :link: models.html#resnet50-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: resnext101-32x8d-imagenet-torch
    :description: ResNeXt-101 32x8d model from `Aggregated Residual Transformations for Deep Neural Networks ` trained on ImageNet
    :link: models.html#resnext101-32x8d-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: resnext50-32x4d-imagenet-torch
    :description: ResNeXt-50 32x4d model from `Aggregated Residual Transformations for Deep Neural Networks ` trained on ImageNet
    :link: models.html#resnext50-32x4d-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: retinanet-resnet50-fpn-coco-torch
    :description: RetinaNet model from `Focal Loss for Dense Object Detection ` with ResNet-50 FPN backbone trained on COCO
    :link: models.html#retinanet-resnet50-fpn-coco-torch
    :tags: Detection,Coco,PyTorch

.. customcarditem::
    :header: rfcn-resnet101-coco-tf
    :description: R-FCN object detection model from `R-FCN: Object Detection via Region-based Fully Convolutional Networks ` with ResNet-101 backbone trained on COCO
    :link: models.html#rfcn-resnet101-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: shufflenetv2-0.5x-imagenet-torch
    :description: ShuffleNetV2 model from `ShuffleNet V2: Practical Guidelines for Efficient CNN Architecture Design ` with 0.5x output channels trained on ImageNet
    :link: models.html#shufflenetv2-0.5x-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: shufflenetv2-1.0x-imagenet-torch
    :description: ShuffleNetV2 model from `ShuffleNet V2: Practical Guidelines for Efficient CNN Architecture Design ` with 1.0x output channels trained on ImageNet
    :link: models.html#shufflenetv2-1.0x-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: squeezenet-1.1-imagenet-torch
    :description: SqueezeNet 1.1 model from `the official SqueezeNet repo ` trained on ImageNet
    :link: models.html#squeezenet-1.1-imagenet-torch
    :tags: Classification,Imagenet,PyTorch

.. customcarditem::
    :header: squeezenet-imagenet-torch
    :description: SqueezeNet model from `SqueezeNet: AlexNet-level accuracy with 50x fewer parameters and ` trained on ImageNet
    :link: models.html#squeezenet-imagenet-torch
    :tags: Classification,Imagenet,PyTorch

.. customcarditem::
    :header: ssd-inception-v2-coco-tf
    :description: Inception Single Shot Detector model from `SSD: Single Shot MultiBox Detector ` trained on COCO
    :link: models.html#ssd-inception-v2-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: ssd-mobilenet-v1-coco-tf
    :description: Single Shot Detector model from `SSD: Single Shot MultiBox Detector ` with MobileNet-v1 backbone trained on COCO
    :link: models.html#ssd-mobilenet-v1-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: ssd-mobilenet-v1-fpn-coco-tf
    :description: FPN Single Shot Detector model from `SSD: Single Shot MultiBox Detector ` with MobileNet-v1 backbone trained on COCO
    :link: models.html#ssd-mobilenet-v1-fpn-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: ssd-resnet50-fpn-coco-tf
    :description: FPN Single Shot Detector model from `SSD: Single Shot MultiBox Detector ` with ResNet-50 backbone trained on COCO
    :link: models.html#ssd-resnet50-fpn-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: vgg11-bn-imagenet-torch
    :description: VGG-11 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` with batch normalization trained on ImageNet
    :link: models.html#vgg11-bn-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: vgg11-imagenet-torch
    :description: VGG-11 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` trained on ImageNet
    :link: models.html#vgg11-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: vgg13-bn-imagenet-torch
    :description: VGG-13 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` with batch normalization trained on ImageNet
    :link: models.html#vgg13-bn-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: vgg13-imagenet-torch
    :description: VGG-13 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` trained on ImageNet
    :link: models.html#vgg13-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: vgg16-bn-imagenet-torch
    :description: VGG-16 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` with batch normalization trained on ImageNet
    :link: models.html#vgg16-bn-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: vgg16-imagenet-tf
    :description: VGG-16 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` trained on ImageNet
    :link: models.html#vgg16-imagenet-tf
    :tags: Classification,Embeddings,Imagenet,TensorFlow

.. customcarditem::
    :header: vgg16-imagenet-torch
    :description: VGG-16 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` trained on ImageNet
    :link: models.html#vgg16-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: vgg19-bn-imagenet-torch
    :description: VGG-19 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` with batch normalization trained on ImageNet
    :link: models.html#vgg19-bn-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: vgg19-imagenet-torch
    :description: VGG-19 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition ` trained on ImageNet
    :link: models.html#vgg19-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: wide-resnet101-2-imagenet-torch
    :description: Wide ResNet-101-2 model from `Wide Residual Networks ` trained on ImageNet
    :link: models.html#wide-resnet101-2-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: wide-resnet50-2-imagenet-torch
    :description: Wide ResNet-50-2 model from `Wide Residual Networks ` trained on ImageNet
    :link: models.html#wide-resnet50-2-imagenet-torch
    :tags: Classification,Embeddings,Imagenet,PyTorch

.. customcarditem::
    :header: yolo-v2-coco-tf1
    :description: YOLOv2 model from `YOLO9000: Better, Faster, Stronger ` trained on COCO
    :link: models.html#yolo-v2-coco-tf1
    :tags: Detection,Coco,TensorFlow 1

.. End of model zoo cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

API reference
-------------

Check out the :ref:`API reference <model-zoo-api>` for complete instructions
for using the Model Zoo library.

Available datasets
------------------

Check out the :ref:`available models <model-zoo-models>` to see all of the
models in the zoo.

.. _model-zoo-basic-recipe:

Basic recipe
------------

Methods for working with the Model Zoo are conveniently exposed via the Python
library and the CLI. The basic recipe is that you load a model from the zoo and
then apply it to a dataset (or a subset of the dataset specified by a
|DatasetView|) using methods such as
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`.

Prediction
~~~~~~~~~~

The Model Zoo provides a number of convenient methods for generating
predictions with zoo models for your datasets.

For example, the code sample below shows a self-contained example of loading a
Faster R-CNN PyTorch model from the model zoo and adding its predictions to the
COCO-2017 dataset from the :ref:`Dataset Zoo <dataset-zoo>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    # List available zoo models
    model_names = foz.list_zoo_models()
    print(model_names)

    #
    # Load zoo model
    #
    # This will download the model from the web, if necessary, and ensure
    # that any required packages are installed
    #
    model = foz.load_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

    #
    # Load some samples from the COCO-2017 validation split
    #
    # This will download the dataset from the web, if necessary
    #
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name="coco-2017-validation-sample",
        max_samples=50,
        shuffle=True,
    )

    #
    # Choose some samples to process. This can be the entire dataset, or a
    # subset of the dataset. In this case, we'll choose some samples at
    # random
    #
    samples = dataset.take(25)

    #
    # Generate predictions for each sample and store the results in the
    # `faster_rcnn` field of the dataset, discarding all predictions with
    # confidence below 0.5
    #
    samples.apply_model(model, "faster_rcnn", confidence_thresh=0.5)
    print(samples)

    # Visualize predictions in the App
    session = fo.launch_app(view=samples)

.. image:: ../../images/model_zoo_predictions_coco_2017.png
   :alt: Model Zoo Predictions
   :align: center

Embeddings
~~~~~~~~~~

Many models in the Model Zoo expose embeddings for their predictions:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # Load zoo model
    model = foz.load_zoo_model("inception-v3-imagenet-torch")

    # Check if model exposes embeddings
    print(model.has_embeddings)  # True

For models that expose embeddings, you can generate embeddings for all
samples in a dataset (or a subset of it specified by a |DatasetView|) by
calling
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # Load zoo model
    model = foz.load_zoo_model("inception-v3-imagenet-torch")
    print(model.has_embeddings)  # True

    # Load zoo dataset
    dataset = foz.load_zoo_dataset("quickstart")

    # Select some samples to process
    samples = dataset.take(10)

    #
    # Option 1: Generate embeddings for each sample and return them in a
    # `num_samples x dim` array
    #
    embeddings = samples.compute_embeddings(model)

    #
    # Option 2: Generate embeddings for each sample and store them in an
    # `embeddings` field of the dataset
    #
    samples.compute_embeddings(model, embeddings_field="embeddings")

You can also use
:meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`
to generate embeddings for image patches defined by another label field, e.g,.
the detections generated by a detection model.

.. _model-zoo-design-overview:

Design overview
---------------

All models in the FiftyOne Model Zoo are instances of the |Model| class, which
defines a common interface for loading models and generating predictions with
defined input and output data formats.

.. note:

    The following sections describe the interface that all models in the Model
    Zoo implement. If you write a wrapper for your custom model that implements
    the |Model| interface, then you can pass your models to builtin methods
    like
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
    and
    :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`
    too!

    FiftyOne provides classes that make it easy to deploy models in custom
    frameworks easy. For example, if you have a PyTorch model that processes
    images, you can likely use
    :class:`TorchImageModel <fiftyone.utils.torch.TorchImageModel>` to run it
    using FiftyOne.

Prediction
~~~~~~~~~~

Inside builtin methods like
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
predictions of a |Model| instance are generated using the following pattern:

.. tabs::

  .. group-tab:: Image models

    .. code-block:: python
        :linenos:

        import numpy as np
        from PIL import Image

        import fiftyone as fo

        def read_rgb_image(path):
            """Utility function that loads an image as an RGB numpy aray."""
            return np.asarray(Image.open(path).convert("rgb"))

        # Load a `Model` instance that processes images
        model = ...

        # Load a FiftyOne dataset
        dataset = fo.load_dataset(...)

        # A sample field in which to store the predictions
        label_field = "predictions"

        # Perform prediction on all images in the dataset
        with model:
            for sample in dataset:
                # Load image
                img = read_rgb_image(sample.filepath)

                # Perform prediction
                labels = model.predict(img)

                # Save labels
                sample.add_labels(labels, label_field)

  .. group-tab:: Video models

    .. code-block:: python
        :linenos:

        import eta.core.video as etav

        import fiftyone as fo

        # Load a `Model` instance that processes videos
        model = ...

        # Load a FiftyOne dataset
        dataset = fo.load_dataset(...)

        # A sample field in which to store the predictions
        label_field = "predictions"

        # Perform prediction on all videos in the dataset
        with model:
            for sample in dataset:
                # Perform prediction
                with etav.FFmpegVideoReader(sample.filepath) as video_reader:
                    labels = model.predict(video_reader)

                # Save labels
                sample.add_labels(labels, label_field)

By convention, |Model| instances must implement the context manager interface,
which handles any necessary setup and teardown required to use the model.

Predictions are generated via the
:meth:`Model.predict() <fiftyone.core.models.Model>` interface method, which
takes an image/video as input and returns the predictions.

In order to be compatible with builtin methods like
:meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
models should support the following basic signature of running inference and
storing the output labels:

.. code-block:: python
    :linenos:

    labels = model.predict(arg)
    sample.add_labels(labels, label_field)

where the model should, at minimum, support ``arg`` values that are:

-   *(Image models)* uint8 numpy arrays (HWC)

-   *(Video models)* ``eta.core.video.VideoReader`` instances

and the output ``labels`` can be any of the following:

-   A |Label| instance, in which case the labels are directly saved in the
    specified ``label_field`` of the sample

.. code-block:: python
    :linenos:

    # Single sample-level label
    sample[label_field] = labels

-   A dict mapping keys to |Label| instances. In this case, the labels are
    added as follows:

.. code-block:: python
    :linenos:

    # Multiple sample-level labels
    for key, value in labels.items():
        sample[label_field + "_" + key] = value

-   A dict mapping frame numbers to |Label| instances. In this case, the
    provided labels are interpreted as frame-level labels that should be added
    as follows:

.. code-block:: python
    :linenos:

    # Single set of per-frame labels
    sample.frames.merge(
        {
            frame_number: {label_field: label}
            for frame_number, label in labels.items()
        }
    )

-   A dict mapping frame numbers to dicts mapping keys to |Label| instances. In
    this case, the provided labels are interpreted as frame-level labels that
    should be added as follows:

.. code-block:: python
    :linenos:

    # Multiple per-frame labels
    sample.frames.merge(
        {
            frame_number: {
                label_field + "_" + name: label
                for name, label in frame_dict.items()
            }
            for frame_number, frame_dict in labels.items()
        }
    )

For models that support batching, the |Model| interface also provides a
:meth:`predict_all() <fiftyone.core.models.Model.predict_all>` method that can
provide an efficient implementation of predicting on a batch of data.

.. note:

    Builtin methods like
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
    provide a ``batch_size`` parameter that can be used to control the batch
    size used when performing inference with models that support efficient
    batching.

.. note:

    PyTorch models can implement the |TorchModelMixin| mixin, in which case
    `DataLoaders <https://pytorch.org/docs/stable/data.html#torch.utils.data.DataLoader>`_
    are used to efficiently feed data to the models during inference.

Embeddings
~~~~~~~~~~

Models that can compute embeddings for their input data can expose this
capability by implementing the |EmbeddingsMixin| mixin.

Inside builtin methods like
:meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`,
embeddings for a collection of samples are generated using an analogous pattern
to the prediction code shown above, except that the embeddings are generated
using :meth:`Model.embed() <fiftyone.core.models.EmbeddingsMixin.embed>` in
place of :meth:`Model.predict() <fiftyone.core.models.Model.predict>`.

By convention,
:meth:`Model.embed() <fiftyone.core.models.EmbeddingsMixin.embed>` should
return a NumPy array containing the embedding.

.. note:

    Sample embeddings are typically 1D vectors, but this is not strictly
    required.

For models that support batching, the |EmbeddingsMixin| interface also provides
a :meth:`embed_all() <fiftyone.core.models.Model.predict_all>` method that can
provide an efficient implementation of embedding a batch of data.

.. toctree::
   :maxdepth: 1
   :hidden:

   API reference <api>
   Available models <models>
