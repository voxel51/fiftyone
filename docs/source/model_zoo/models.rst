
.. _model-zoo-models:

Built-In Zoo Models
===================

.. default-role:: code

This page lists all of the natively available models in the FiftyOne Model Zoo.

Check out the :ref:`API reference <model-zoo-api>` for complete instructions
for using the Model Zoo.


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


.. customcarditem::
    :header: alexnet-imagenet-torch
    :description: AlexNet model architecture from "One weird trick for parallelizing convolutional neural networks" trained on ImageNet
    :link: models.html#alexnet-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: centernet-hg104-1024-coco-tf2
    :description: CenterNet model from "Objects as Points" with the Hourglass-104 backbone trained on COCO resized to 1024x1024
    :link: models.html#centernet-hg104-1024-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: centernet-hg104-512-coco-tf2
    :description: CenterNet model from "Objects as Points" with the Hourglass-104 backbone trained on COCO resized to 512x512
    :link: models.html#centernet-hg104-512-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: centernet-mobilenet-v2-fpn-512-coco-tf2
    :description: CenterNet model from "Objects as Points" with the MobileNetV2 backbone trained on COCO resized to 512x512
    :link: models.html#centernet-mobilenet-v2-fpn-512-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: centernet-resnet101-v1-fpn-512-coco-tf2
    :description: CenterNet model from "Objects as Points" with the ResNet-101v1 backbone + FPN trained on COCO resized to 512x512
    :link: models.html#centernet-resnet101-v1-fpn-512-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: centernet-resnet50-v1-fpn-512-coco-tf2
    :description: CenterNet model from "Objects as Points" with the ResNet-50-v1 backbone + FPN trained on COCO resized to 512x512
    :link: models.html#centernet-resnet50-v1-fpn-512-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: centernet-resnet50-v2-512-coco-tf2
    :description: CenterNet model from "Objects as Points" with the ResNet-50v2 backbone trained on COCO resized to 512x512
    :link: models.html#centernet-resnet50-v2-512-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: classification-transformer-torch
    :description: Hugging Face Transformers model for image classification
    :link: models.html#classification-transformer-torch
    :tags: Classification,Logits,Embeddings,PyTorch,Transformers

.. customcarditem::
    :header: clip-vit-base32-torch
    :description: CLIP text/image encoder from "Learning Transferable Visual Models From Natural Language Supervision" trained on 400M text-image pairs
    :link: models.html#clip-vit-base32-torch
    :tags: Classification,Logits,Embeddings,PyTorch,Clip,Zero-shot

.. customcarditem::
    :header: deeplabv3-cityscapes-tf
    :description: DeepLabv3+ semantic segmentation model from "Encoder-Decoder with Atrous Separable Convolution for Semantic Image Segmentation" with Xception backbone trained on the Cityscapes dataset
    :link: models.html#deeplabv3-cityscapes-tf
    :tags: Segmentation,Cityscapes,TensorFlow

.. customcarditem::
    :header: deeplabv3-mnv2-cityscapes-tf
    :description: DeepLabv3+ semantic segmentation model from "Encoder-Decoder with Atrous Separable Convolution for Semantic Image Segmentation" with MobileNetV2 backbone trained on the Cityscapes dataset
    :link: models.html#deeplabv3-mnv2-cityscapes-tf
    :tags: Segmentation,Cityscapes,TensorFlow

.. customcarditem::
    :header: deeplabv3-resnet101-coco-torch
    :description: DeepLabV3 model from "Rethinking Atrous Convolution for Semantic Image Segmentation" with ResNet-101 backbone trained on COCO
    :link: models.html#deeplabv3-resnet101-coco-torch
    :tags: Segmentation,Coco,PyTorch

.. customcarditem::
    :header: deeplabv3-resnet50-coco-torch
    :description: DeepLabV3 model from "Rethinking Atrous Convolution for Semantic Image Segmentation" with ResNet-50 backbone trained on COCO
    :link: models.html#deeplabv3-resnet50-coco-torch
    :tags: Segmentation,Coco,PyTorch

.. customcarditem::
    :header: densenet121-imagenet-torch
    :description: Densenet-121 model from "Densely Connected Convolutional Networks" trained on ImageNet
    :link: models.html#densenet121-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: densenet161-imagenet-torch
    :description: Densenet-161 model from "Densely Connected Convolutional Networks" trained on ImageNet
    :link: models.html#densenet161-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: densenet169-imagenet-torch
    :description: Densenet-169 model from "Densely Connected Convolutional Networks" trained on ImageNet
    :link: models.html#densenet169-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: densenet201-imagenet-torch
    :description: Densenet-201 model from "Densely Connected Convolutional Networks" trained on ImageNet
    :link: models.html#densenet201-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: depth-estimation-transformer-torch
    :description: Hugging Face Transformers model for monocular depth estimation
    :link: models.html#depth-estimation-transformer-torch
    :tags: Depth,PyTorch,Transformers

.. customcarditem::
    :header: detection-transformer-torch
    :description: Hugging Face Transformers model for object detection
    :link: models.html#detection-transformer-torch
    :tags: Detection,Logits,Embeddings,PyTorch,Transformers

.. customcarditem::
    :header: dinov2-vitb14-torch
    :description: DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-B/14 distilled
    :link: models.html#dinov2-vitb14-torch
    :tags: Embeddings,PyTorch

.. customcarditem::
    :header: dinov2-vitg14-torch
    :description: DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-g/14
    :link: models.html#dinov2-vitg14-torch
    :tags: Embeddings,PyTorch

.. customcarditem::
    :header: dinov2-vitl14-torch
    :description: DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-L/14 distilled
    :link: models.html#dinov2-vitl14-torch
    :tags: Embeddings,PyTorch

.. customcarditem::
    :header: dinov2-vits14-torch
    :description: DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-S/14 distilled
    :link: models.html#dinov2-vits14-torch
    :tags: Embeddings,PyTorch

.. customcarditem::
    :header: efficientdet-d0-512-coco-tf2
    :description: EfficientDet-D0 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO resized to 512x512
    :link: models.html#efficientdet-d0-512-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: efficientdet-d0-coco-tf1
    :description: EfficientDet-D0 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO
    :link: models.html#efficientdet-d0-coco-tf1
    :tags: Detection,Coco,TensorFlow-1

.. customcarditem::
    :header: efficientdet-d1-640-coco-tf2
    :description: EfficientDet-D1 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO resized to 640x640
    :link: models.html#efficientdet-d1-640-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: efficientdet-d1-coco-tf1
    :description: EfficientDet-D1 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO
    :link: models.html#efficientdet-d1-coco-tf1
    :tags: Detection,Coco,TensorFlow-1

.. customcarditem::
    :header: efficientdet-d2-768-coco-tf2
    :description: EfficientDet-D2 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO resized to 768x768
    :link: models.html#efficientdet-d2-768-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: efficientdet-d2-coco-tf1
    :description: EfficientDet-D2 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO
    :link: models.html#efficientdet-d2-coco-tf1
    :tags: Detection,Coco,TensorFlow-1

.. customcarditem::
    :header: efficientdet-d3-896-coco-tf2
    :description: EfficientDet-D3 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO resized to 896x896
    :link: models.html#efficientdet-d3-896-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: efficientdet-d3-coco-tf1
    :description: EfficientDet-D3 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO
    :link: models.html#efficientdet-d3-coco-tf1
    :tags: Detection,Coco,TensorFlow-1

.. customcarditem::
    :header: efficientdet-d4-1024-coco-tf2
    :description: EfficientDet-D4 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO resized to 1024x1024
    :link: models.html#efficientdet-d4-1024-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: efficientdet-d4-coco-tf1
    :description: EfficientDet-D4 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO
    :link: models.html#efficientdet-d4-coco-tf1
    :tags: Detection,Coco,TensorFlow-1

.. customcarditem::
    :header: efficientdet-d5-1280-coco-tf2
    :description: EfficientDet-D5 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO resized to 1280x1280
    :link: models.html#efficientdet-d5-1280-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: efficientdet-d5-coco-tf1
    :description: EfficientDet-D5 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO
    :link: models.html#efficientdet-d5-coco-tf1
    :tags: Detection,Coco,TensorFlow-1

.. customcarditem::
    :header: efficientdet-d6-1280-coco-tf2
    :description: EfficientDet-D6 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO resized to 1280x1280
    :link: models.html#efficientdet-d6-1280-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: efficientdet-d6-coco-tf1
    :description: EfficientDet-D6 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO
    :link: models.html#efficientdet-d6-coco-tf1
    :tags: Detection,Coco,TensorFlow-1

.. customcarditem::
    :header: efficientdet-d7-1536-coco-tf2
    :description: EfficientDet-D7 model from "EfficientDet: Scalable and Efficient Object Detection" trained on COCO resized to 1536x1536
    :link: models.html#efficientdet-d7-1536-coco-tf2
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: faster-rcnn-inception-resnet-atrous-v2-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" atrous version with Inception backbone trained on COCO
    :link: models.html#faster-rcnn-inception-resnet-atrous-v2-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" atrous version with low-proposals and Inception backbone trained on COCO
    :link: models.html#faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-inception-v2-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" with Inception v2 backbone trained on COCO
    :link: models.html#faster-rcnn-inception-v2-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-nas-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" with NAS-net backbone trained on COCO
    :link: models.html#faster-rcnn-nas-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-nas-lowproposals-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" with low-proposals and NAS-net backbone trained on COCO
    :link: models.html#faster-rcnn-nas-lowproposals-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-resnet101-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" with ResNet-101 backbone trained on COCO
    :link: models.html#faster-rcnn-resnet101-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-resnet101-lowproposals-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" with low-proposals and ResNet-101 backbone trained on COCO
    :link: models.html#faster-rcnn-resnet101-lowproposals-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-resnet50-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" with ResNet-50 backbone trained on COCO
    :link: models.html#faster-rcnn-resnet50-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: faster-rcnn-resnet50-fpn-coco-torch
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" with ResNet-50 FPN backbone trained on COCO
    :link: models.html#faster-rcnn-resnet50-fpn-coco-torch
    :tags: Detection,Coco,PyTorch

.. customcarditem::
    :header: faster-rcnn-resnet50-lowproposals-coco-tf
    :description: Faster R-CNN model from "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" with low-proposals and ResNet-50 backbone trained on COCO
    :link: models.html#faster-rcnn-resnet50-lowproposals-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: fcn-resnet101-coco-torch
    :description: FCN model from "Fully Convolutional Networks for Semantic Segmentation" with ResNet-101 backbone trained on COCO
    :link: models.html#fcn-resnet101-coco-torch
    :tags: Segmentation,Coco,PyTorch

.. customcarditem::
    :header: fcn-resnet50-coco-torch
    :description: FCN model from "Fully Convolutional Networks for Semantic Segmentation" with ResNet-50 backbone trained on COCO
    :link: models.html#fcn-resnet50-coco-torch
    :tags: Segmentation,Coco,PyTorch

.. customcarditem::
    :header: googlenet-imagenet-torch
    :description: GoogLeNet (Inception v1) model from "Going Deeper with Convolutions" trained on ImageNet
    :link: models.html#googlenet-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: inception-resnet-v2-imagenet-tf1
    :description: Inception v2 model from "Rethinking the Inception Architecture for Computer Vision" trained on ImageNet
    :link: models.html#inception-resnet-v2-imagenet-tf1
    :tags: Classification,Embeddings,Logits,Imagenet,TensorFlow-1

.. customcarditem::
    :header: inception-v3-imagenet-torch
    :description: Inception v3 model from "Rethinking the Inception Architecture for Computer Vision" trained on ImageNet
    :link: models.html#inception-v3-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: inception-v4-imagenet-tf1
    :description: Inception v4 model from "Inception-v4, Inception-ResNet and the Impact of Residual Connections on Learning" trained on ImageNet
    :link: models.html#inception-v4-imagenet-tf1
    :tags: Classification,Embeddings,Logits,Imagenet,TensorFlow-1

.. customcarditem::
    :header: keypoint-rcnn-resnet50-fpn-coco-torch
    :description: Keypoint R-CNN model from "Mask R-CNN" with ResNet-50 FPN backbone trained on COCO
    :link: models.html#keypoint-rcnn-resnet50-fpn-coco-torch
    :tags: Keypoints,Coco,PyTorch

.. customcarditem::
    :header: mask-rcnn-inception-resnet-v2-atrous-coco-tf
    :description: Mask R-CNN model from "Mask R-CNN" atrous version with Inception backbone trained on COCO
    :link: models.html#mask-rcnn-inception-resnet-v2-atrous-coco-tf
    :tags: Instances,Coco,TensorFlow

.. customcarditem::
    :header: mask-rcnn-inception-v2-coco-tf
    :description: Mask R-CNN model from "Mask R-CNN" with Inception backbone trained on COCO
    :link: models.html#mask-rcnn-inception-v2-coco-tf
    :tags: Instances,Coco,TensorFlow

.. customcarditem::
    :header: mask-rcnn-resnet101-atrous-coco-tf
    :description: Mask R-CNN model from "Mask R-CNN" atrous version with ResNet-101 backbone trained on COCO
    :link: models.html#mask-rcnn-resnet101-atrous-coco-tf
    :tags: Instances,Coco,TensorFlow

.. customcarditem::
    :header: mask-rcnn-resnet50-atrous-coco-tf
    :description: Mask R-CNN model from "Mask R-CNN" atrous version with ResNet-50 backbone trained on COCO
    :link: models.html#mask-rcnn-resnet50-atrous-coco-tf
    :tags: Instances,Coco,TensorFlow

.. customcarditem::
    :header: mask-rcnn-resnet50-fpn-coco-torch
    :description: Mask R-CNN model from "Mask R-CNN" with ResNet-50 FPN backbone trained on COCO
    :link: models.html#mask-rcnn-resnet50-fpn-coco-torch
    :tags: Instances,Coco,PyTorch

.. customcarditem::
    :header: mnasnet0.5-imagenet-torch
    :description: MNASNet model from from "MnasNet: Platform-Aware Neural Architecture Search for Mobile" with depth multiplier of 0.5 trained on ImageNet
    :link: models.html#mnasnet0.5-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: mnasnet1.0-imagenet-torch
    :description: MNASNet model from "MnasNet: Platform-Aware Neural Architecture Search for Mobile" with depth multiplier of 1.0 trained on ImageNet
    :link: models.html#mnasnet1.0-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: mobilenet-v2-imagenet-tf1
    :description: MobileNetV2 model from "MobileNetV2: Inverted Residuals and Linear Bottlenecks" trained on ImageNet
    :link: models.html#mobilenet-v2-imagenet-tf1
    :tags: Classification,Embeddings,Logits,Imagenet,TensorFlow-1

.. customcarditem::
    :header: mobilenet-v2-imagenet-torch
    :description: MobileNetV2 model from "MobileNetV2: Inverted Residuals and Linear Bottlenecks" trained on ImageNet
    :link: models.html#mobilenet-v2-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: open-clip-torch
    :description: OPEN CLIP text/image encoder from "Learning Transferable Visual Models From Natural Language Supervision" trained on 400M text-image pairs
    :link: models.html#open-clip-torch
    :tags: Classification,Logits,Embeddings,PyTorch,Clip,Zero-shot

.. customcarditem::
    :header: resnet-v1-50-imagenet-tf1
    :description: ResNet-50 v1 model from "Deep Residual Learning for Image Recognition" trained on ImageNet
    :link: models.html#resnet-v1-50-imagenet-tf1
    :tags: Classification,Embeddings,Logits,Imagenet,TensorFlow-1

.. customcarditem::
    :header: resnet-v2-50-imagenet-tf1
    :description: ResNet-50 v2 model from "Deep Residual Learning for Image Recognition" trained on ImageNet
    :link: models.html#resnet-v2-50-imagenet-tf1
    :tags: Classification,Embeddings,Logits,Imagenet,TensorFlow-1

.. customcarditem::
    :header: resnet101-imagenet-torch
    :description: ResNet-101 model from "Deep Residual Learning for Image Recognition" trained on ImageNet
    :link: models.html#resnet101-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: resnet152-imagenet-torch
    :description: ResNet-152 model from "Deep Residual Learning for Image Recognition" trained on ImageNet
    :link: models.html#resnet152-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: resnet18-imagenet-torch
    :description: ResNet-18 model from "Deep Residual Learning for Image Recognition" trained on ImageNet
    :link: models.html#resnet18-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: resnet34-imagenet-torch
    :description: ResNet-34 model from "Deep Residual Learning for Image Recognition" trained on ImageNet
    :link: models.html#resnet34-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: resnet50-imagenet-torch
    :description: ResNet-50 model from "Deep Residual Learning for Image Recognition" trained on ImageNet
    :link: models.html#resnet50-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: resnext101-32x8d-imagenet-torch
    :description: ResNeXt-101 32x8d model from "Aggregated Residual Transformations for Deep Neural Networks" trained on ImageNet
    :link: models.html#resnext101-32x8d-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: resnext50-32x4d-imagenet-torch
    :description: ResNeXt-50 32x4d model from "Aggregated Residual Transformations for Deep Neural Networks" trained on ImageNet
    :link: models.html#resnext50-32x4d-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: retinanet-resnet50-fpn-coco-torch
    :description: RetinaNet model from "Focal Loss for Dense Object Detection" with ResNet-50 FPN backbone trained on COCO
    :link: models.html#retinanet-resnet50-fpn-coco-torch
    :tags: Detection,Coco,PyTorch

.. customcarditem::
    :header: rfcn-resnet101-coco-tf
    :description: R-FCN object detection model from "R-FCN: Object Detection via Region-based Fully Convolutional Networks" with ResNet-101 backbone trained on COCO
    :link: models.html#rfcn-resnet101-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: rtdetr-l-coco-torch
    :description: RT-DETR-l model trained on COCO
    :link: models.html#rtdetr-l-coco-torch
    :tags: Detection,Coco,PyTorch,Transformer

.. customcarditem::
    :header: rtdetr-x-coco-torch
    :description: RT-DETR-x model trained on COCO
    :link: models.html#rtdetr-x-coco-torch
    :tags: Detection,Coco,PyTorch,Transformer

.. customcarditem::
    :header: segment-anything-2-hiera-base-plus-image-torch
    :description: Segment Anything Model 2 (SAM2) from "SAM2: Segment Anything in Images and Videos"
    :link: models.html#segment-anything-2-hiera-base-plus-image-torch
    :tags: Segment-anything,PyTorch,Zero-shot

.. customcarditem::
    :header: segment-anything-2-hiera-base-plus-video-torch
    :description: Segment Anything Model 2 (SAM2) from "SAM2: Segment Anything in Images and Videos"
    :link: models.html#segment-anything-2-hiera-base-plus-video-torch
    :tags: Segment-anything,PyTorch,Zero-shot,Video

.. customcarditem::
    :header: segment-anything-2-hiera-large-image-torch
    :description: Segment Anything Model 2 (SAM2) from "SAM2: Segment Anything in Images and Videos"
    :link: models.html#segment-anything-2-hiera-large-image-torch
    :tags: Segment-anything,PyTorch,Zero-shot

.. customcarditem::
    :header: segment-anything-2-hiera-large-video-torch
    :description: Segment Anything Model 2 (SAM2) from "SAM2: Segment Anything in Images and Videos"
    :link: models.html#segment-anything-2-hiera-large-video-torch
    :tags: Segment-anything,PyTorch,Zero-shot,Video

.. customcarditem::
    :header: segment-anything-2-hiera-small-image-torch
    :description: Segment Anything Model 2 (SAM2) from "SAM2: Segment Anything in Images and Videos"
    :link: models.html#segment-anything-2-hiera-small-image-torch
    :tags: Segment-anything,PyTorch,Zero-shot

.. customcarditem::
    :header: segment-anything-2-hiera-small-video-torch
    :description: Segment Anything Model 2 (SAM2) from "SAM2: Segment Anything in Images and Videos"
    :link: models.html#segment-anything-2-hiera-small-video-torch
    :tags: Segment-anything,PyTorch,Zero-shot,Video

.. customcarditem::
    :header: segment-anything-2-hiera-tiny-image-torch
    :description: Segment Anything Model 2 (SAM2) from "SAM2: Segment Anything in Images and Videos"
    :link: models.html#segment-anything-2-hiera-tiny-image-torch
    :tags: Segment-anything,PyTorch,Zero-shot

.. customcarditem::
    :header: segment-anything-2-hiera-tiny-video-torch
    :description: Segment Anything Model 2 (SAM2) from "SAM2: Segment Anything in Images and Videos"
    :link: models.html#segment-anything-2-hiera-tiny-video-torch
    :tags: Segment-anything,PyTorch,Zero-shot,Video

.. customcarditem::
    :header: segment-anything-vitb-torch
    :description: Segment Anything Model (SAM) from "Segment Anything" with ViT-B/16 backbone trained on SA-1B
    :link: models.html#segment-anything-vitb-torch
    :tags: Segment-anything,Sa-1b,PyTorch,Zero-shot

.. customcarditem::
    :header: segment-anything-vith-torch
    :description: Segment Anything Model (SAM) from "Segment Anything" with ViT-H/16 backbone trained on SA-1B
    :link: models.html#segment-anything-vith-torch
    :tags: Segment-anything,Sa-1b,PyTorch,Zero-shot

.. customcarditem::
    :header: segment-anything-vitl-torch
    :description: Segment Anything Model (SAM) from "Segment Anything" with ViT-L/16 backbone trained on SA-1B
    :link: models.html#segment-anything-vitl-torch
    :tags: Segment-anything,Sa-1b,PyTorch,Zero-shot

.. customcarditem::
    :header: segmentation-transformer-torch
    :description: Hugging Face Transformers model for semantic segmentation
    :link: models.html#segmentation-transformer-torch
    :tags: Segmentation,PyTorch,Transformers

.. customcarditem::
    :header: shufflenetv2-0.5x-imagenet-torch
    :description: ShuffleNetV2 model from "ShuffleNet V2: Practical Guidelines for Efficient CNN Architecture Design" with 0.5x output channels trained on ImageNet
    :link: models.html#shufflenetv2-0.5x-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: shufflenetv2-1.0x-imagenet-torch
    :description: ShuffleNetV2 model from "ShuffleNet V2: Practical Guidelines for Efficient CNN Architecture Design" with 1.0x output channels trained on ImageNet
    :link: models.html#shufflenetv2-1.0x-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: squeezenet-1.1-imagenet-torch
    :description: SqueezeNet 1.1 model from "the official SqueezeNet repo" trained on ImageNet
    :link: models.html#squeezenet-1.1-imagenet-torch
    :tags: Classification,Imagenet,PyTorch

.. customcarditem::
    :header: squeezenet-imagenet-torch
    :description: SqueezeNet model from "SqueezeNet: AlexNet-level accuracy with 50x fewer parameters and" trained on ImageNet
    :link: models.html#squeezenet-imagenet-torch
    :tags: Classification,Imagenet,PyTorch

.. customcarditem::
    :header: ssd-inception-v2-coco-tf
    :description: Inception Single Shot Detector model from "SSD: Single Shot MultiBox Detector" trained on COCO
    :link: models.html#ssd-inception-v2-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: ssd-mobilenet-v1-coco-tf
    :description: Single Shot Detector model from "SSD: Single Shot MultiBox Detector" with MobileNetV1 backbone trained on COCO
    :link: models.html#ssd-mobilenet-v1-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: ssd-mobilenet-v1-fpn-640-coco17
    :description: MobileNetV1 model from "MobileNetV2: Inverted Residuals and Linear Bottlenecks" resized to 640x640
    :link: models.html#ssd-mobilenet-v1-fpn-640-coco17
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: ssd-mobilenet-v1-fpn-coco-tf
    :description: FPN Single Shot Detector model from "SSD: Single Shot MultiBox Detector" with MobileNetV1 backbone trained on COCO
    :link: models.html#ssd-mobilenet-v1-fpn-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: ssd-mobilenet-v2-320-coco17
    :description: MobileNetV2 model from "MobileNetV2: Inverted Residuals and Linear Bottlenecks" resized to 320x320
    :link: models.html#ssd-mobilenet-v2-320-coco17
    :tags: Detection,Coco,TensorFlow-2

.. customcarditem::
    :header: ssd-resnet50-fpn-coco-tf
    :description: FPN Single Shot Detector model from "SSD: Single Shot MultiBox Detector" with ResNet-50 backbone trained on COCO
    :link: models.html#ssd-resnet50-fpn-coco-tf
    :tags: Detection,Coco,TensorFlow

.. customcarditem::
    :header: vgg11-bn-imagenet-torch
    :description: VGG-11 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" with batch normalization trained on ImageNet
    :link: models.html#vgg11-bn-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: vgg11-imagenet-torch
    :description: VGG-11 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" trained on ImageNet
    :link: models.html#vgg11-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: vgg13-bn-imagenet-torch
    :description: VGG-13 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" with batch normalization trained on ImageNet
    :link: models.html#vgg13-bn-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: vgg13-imagenet-torch
    :description: VGG-13 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" trained on ImageNet
    :link: models.html#vgg13-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: vgg16-bn-imagenet-torch
    :description: VGG-16 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" with batch normalization trained on ImageNet
    :link: models.html#vgg16-bn-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: vgg16-imagenet-tf1
    :description: VGG-16 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" trained on ImageNet
    :link: models.html#vgg16-imagenet-tf1
    :tags: Classification,Embeddings,Logits,Imagenet,TensorFlow-1

.. customcarditem::
    :header: vgg16-imagenet-torch
    :description: VGG-16 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" trained on ImageNet
    :link: models.html#vgg16-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: vgg19-bn-imagenet-torch
    :description: VGG-19 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" with batch normalization trained on ImageNet
    :link: models.html#vgg19-bn-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: vgg19-imagenet-torch
    :description: VGG-19 model from "Very Deep Convolutional Networks for Large-Scale Image Recognition" trained on ImageNet
    :link: models.html#vgg19-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: wide-resnet101-2-imagenet-torch
    :description: Wide ResNet-101-2 model from "Wide Residual Networks" trained on ImageNet
    :link: models.html#wide-resnet101-2-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: wide-resnet50-2-imagenet-torch
    :description: Wide ResNet-50-2 model from "Wide Residual Networks" trained on ImageNet
    :link: models.html#wide-resnet50-2-imagenet-torch
    :tags: Classification,Embeddings,Logits,Imagenet,PyTorch

.. customcarditem::
    :header: yolo-nas-torch
    :description: YOLO-NAS is an open-source training library for advanced computer vision models. It specializes in accuracy and efficiency, supporting tasks like object detection
    :link: models.html#yolo-nas-torch
    :tags: Classification,PyTorch,Yolo

.. customcarditem::
    :header: yolo-v2-coco-tf1
    :description: YOLOv2 model from "YOLO9000: Better, Faster, Stronger" trained on COCO
    :link: models.html#yolo-v2-coco-tf1
    :tags: Detection,Coco,TensorFlow-1

.. customcarditem::
    :header: yolov10l-coco-torch
    :description: YOLOv10-L model trained on COCO
    :link: models.html#yolov10l-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov10m-coco-torch
    :description: YOLOv10-M model trained on COCO
    :link: models.html#yolov10m-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov10n-coco-torch
    :description: YOLOv10-N model trained on COCO
    :link: models.html#yolov10n-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov10s-coco-torch
    :description: YOLOv10-S model trained on COCO
    :link: models.html#yolov10s-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov10x-coco-torch
    :description: YOLOv10-X model trained on COCO
    :link: models.html#yolov10x-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov5l-coco-torch
    :description: Ultralytics YOLOv5l model trained on COCO
    :link: models.html#yolov5l-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov5m-coco-torch
    :description: Ultralytics YOLOv5m model trained on COCO
    :link: models.html#yolov5m-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov5n-coco-torch
    :description: Ultralytics YOLOv5n model trained on COCO
    :link: models.html#yolov5n-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov5s-coco-torch
    :description: Ultralytics YOLOv5s model trained on COCO
    :link: models.html#yolov5s-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov5x-coco-torch
    :description: Ultralytics YOLOv5x model trained on COCO
    :link: models.html#yolov5x-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8l-coco-torch
    :description: Ultralytics YOLOv8l model trained on COCO
    :link: models.html#yolov8l-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8l-obb-dotav1-torch
    :description: YOLOv8l Oriented Bounding Box model
    :link: models.html#yolov8l-obb-dotav1-torch
    :tags: Detection,PyTorch,Yolo,Polylines,Obb

.. customcarditem::
    :header: yolov8l-oiv7-torch
    :description: Ultralytics YOLOv8l model trained Open Images v7
    :link: models.html#yolov8l-oiv7-torch
    :tags: Detection,Oiv7,PyTorch,Yolo

.. customcarditem::
    :header: yolov8l-seg-coco-torch
    :description: Ultralytics YOLOv8l Segmentation model trained on COCO
    :link: models.html#yolov8l-seg-coco-torch
    :tags: Segmentation,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8l-world-torch
    :description: YOLOv8l-World model
    :link: models.html#yolov8l-world-torch
    :tags: Detection,PyTorch,Yolo,Zero-shot

.. customcarditem::
    :header: yolov8m-coco-torch
    :description: Ultralytics YOLOv8m model trained on COCO
    :link: models.html#yolov8m-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8m-obb-dotav1-torch
    :description: YOLOv8m Oriented Bounding Box model
    :link: models.html#yolov8m-obb-dotav1-torch
    :tags: Detection,PyTorch,Yolo,Polylines,Obb

.. customcarditem::
    :header: yolov8m-oiv7-torch
    :description: Ultralytics YOLOv8m model trained Open Images v7
    :link: models.html#yolov8m-oiv7-torch
    :tags: Detection,Oiv7,PyTorch,Yolo

.. customcarditem::
    :header: yolov8m-seg-coco-torch
    :description: Ultralytics YOLOv8m Segmentation model trained on COCO
    :link: models.html#yolov8m-seg-coco-torch
    :tags: Segmentation,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8m-world-torch
    :description: YOLOv8m-World model
    :link: models.html#yolov8m-world-torch
    :tags: Detection,PyTorch,Yolo,Zero-shot

.. customcarditem::
    :header: yolov8n-coco-torch
    :description: Ultralytics YOLOv8n model trained on COCO
    :link: models.html#yolov8n-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8n-obb-dotav1-torch
    :description: YOLOv8n Oriented Bounding Box model
    :link: models.html#yolov8n-obb-dotav1-torch
    :tags: Detection,PyTorch,Yolo,Polylines,Obb

.. customcarditem::
    :header: yolov8n-oiv7-torch
    :description: Ultralytics YOLOv8n model trained on Open Images v7
    :link: models.html#yolov8n-oiv7-torch
    :tags: Detection,Oiv7,PyTorch,Yolo

.. customcarditem::
    :header: yolov8n-seg-coco-torch
    :description: Ultralytics YOLOv8n Segmentation model trained on COCO
    :link: models.html#yolov8n-seg-coco-torch
    :tags: Segmentation,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8s-coco-torch
    :description: Ultralytics YOLOv8s model trained on COCO
    :link: models.html#yolov8s-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8s-obb-dotav1-torch
    :description: YOLOv8s Oriented Bounding Box model
    :link: models.html#yolov8s-obb-dotav1-torch
    :tags: Detection,PyTorch,Yolo,Polylines,Obb

.. customcarditem::
    :header: yolov8s-oiv7-torch
    :description: Ultralytics YOLOv8s model trained on Open Images v7
    :link: models.html#yolov8s-oiv7-torch
    :tags: Detection,Oiv7,PyTorch,Yolo

.. customcarditem::
    :header: yolov8s-seg-coco-torch
    :description: Ultralytics YOLOv8s Segmentation model trained on COCO
    :link: models.html#yolov8s-seg-coco-torch
    :tags: Segmentation,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8s-world-torch
    :description: YOLOv8s-World model
    :link: models.html#yolov8s-world-torch
    :tags: Detection,PyTorch,Yolo,Zero-shot

.. customcarditem::
    :header: yolov8x-coco-torch
    :description: Ultralytics YOLOv8x model trained on COCO
    :link: models.html#yolov8x-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8x-obb-dotav1-torch
    :description: YOLOv8x Oriented Bounding Box model
    :link: models.html#yolov8x-obb-dotav1-torch
    :tags: Detection,PyTorch,Yolo,Polylines,Obb

.. customcarditem::
    :header: yolov8x-oiv7-torch
    :description: Ultralytics YOLOv8x model trained Open Images v7
    :link: models.html#yolov8x-oiv7-torch
    :tags: Detection,Oiv7,PyTorch,Yolo

.. customcarditem::
    :header: yolov8x-seg-coco-torch
    :description: Ultralytics YOLOv8x Segmentation model trained on COCO
    :link: models.html#yolov8x-seg-coco-torch
    :tags: Segmentation,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov8x-world-torch
    :description: YOLOv8x-World model
    :link: models.html#yolov8x-world-torch
    :tags: Detection,PyTorch,Yolo,Zero-shot

.. customcarditem::
    :header: yolov9c-coco-torch
    :description: YOLOv9-C model trained on COCO
    :link: models.html#yolov9c-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov9c-seg-coco-torch
    :description: YOLOv9-C Segmentation model trained on COCO
    :link: models.html#yolov9c-seg-coco-torch
    :tags: Segmentation,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov9e-coco-torch
    :description: YOLOv9-E model trained on COCO
    :link: models.html#yolov9e-coco-torch
    :tags: Detection,Coco,PyTorch,Yolo

.. customcarditem::
    :header: yolov9e-seg-coco-torch
    :description: YOLOv9-E Segmentation model trained on COCO
    :link: models.html#yolov9e-seg-coco-torch
    :tags: Segmentation,Coco,PyTorch,Yolo

.. customcarditem::
    :header: zero-shot-classification-transformer-torch
    :description: Hugging Face Transformers model for zero-shot image classification
    :link: models.html#zero-shot-classification-transformer-torch
    :tags: Classification,Logits,Embeddings,PyTorch,Transformers,Zero-shot

.. customcarditem::
    :header: zero-shot-detection-transformer-torch
    :description: Hugging Face Transformers model for zero-shot object detection
    :link: models.html#zero-shot-detection-transformer-torch
    :tags: Detection,Logits,Embeddings,PyTorch,Transformers,Zero-shot

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>


.. _model-zoo-torch-models:

Torch models
------------

.. _model-zoo-alexnet-imagenet-torch:

alexnet-imagenet-torch
______________________

AlexNet model architecture from `One weird trick for parallelizing convolutional neural networks <https://arxiv.org/abs/1404.5997>`_ trained on ImageNet.

**Details**

-   Model name: ``alexnet-imagenet-torch``
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 233.10 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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



.. _model-zoo-classification-transformer-torch:

classification-transformer-torch
________________________________

Hugging Face Transformers model for image classification.

**Details**

-   Model name: ``classification-transformer-torch``
-   Model source: https://huggingface.co/docs/transformers/tasks/image_classification
-   Exposes embeddings? yes
-   Tags: ``classification, logits, embeddings, torch, transformers``

**Requirements**

-   Packages: ``torch, torchvision, transformers``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("classification-transformer-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-clip-vit-base32-torch:

clip-vit-base32-torch
_____________________

CLIP text/image encoder from `Learning Transferable Visual Models From Natural Language Supervision <https://arxiv.org/abs/2103.00020>`_ trained on 400M text-image pairs.

**Details**

-   Model name: ``clip-vit-base32-torch``
-   Model source: https://github.com/openai/CLIP
-   Model size: 337.58 MB
-   Exposes embeddings? yes
-   Tags: ``classification, logits, embeddings, torch, clip, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("clip-vit-base32-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

    #
    # Make zero-shot predictions with custom classes
    #

    model = foz.load_zoo_model(
        "clip-vit-base32-torch",
        text_prompt="A photo of a",
        classes=["person", "dog", "cat", "bird", "car", "tree", "chair"],
    )

    dataset.apply_model(model, label_field="predictions")
    session.refresh()


.. _model-zoo-deeplabv3-resnet101-coco-torch:

deeplabv3-resnet101-coco-torch
______________________________

DeepLabV3 model from `Rethinking Atrous Convolution for Semantic Image Segmentation <https://arxiv.org/abs/1706.05587>`_ with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``deeplabv3-resnet101-coco-torch``
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 233.22 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 160.51 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 30.84 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 110.37 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 54.71 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 77.37 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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



.. _model-zoo-depth-estimation-transformer-torch:

depth-estimation-transformer-torch
__________________________________

Hugging Face Transformers model for monocular depth estimation.

**Details**

-   Model name: ``depth-estimation-transformer-torch``
-   Model source: https://huggingface.co/docs/transformers/tasks/monocular_depth_estimation
-   Exposes embeddings? no
-   Tags: ``depth, torch, transformers``

**Requirements**

-   Packages: ``torch, torchvision, transformers``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("depth-estimation-transformer-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-detection-transformer-torch:

detection-transformer-torch
___________________________

Hugging Face Transformers model for object detection.

**Details**

-   Model name: ``detection-transformer-torch``
-   Model source: https://huggingface.co/docs/transformers/tasks/object_detection
-   Exposes embeddings? yes
-   Tags: ``detection, logits, embeddings, torch, transformers``

**Requirements**

-   Packages: ``torch, torchvision, transformers``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("detection-transformer-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-dinov2-vitb14-torch:

dinov2-vitb14-torch
___________________

DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-B/14 distilled.

**Details**

-   Model name: ``dinov2-vitb14-torch``
-   Model source: https://github.com/facebookresearch/dinov2
-   Model size: 330.33 MB
-   Exposes embeddings? yes
-   Tags: ``embeddings, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("dinov2-vitb14-torch")

    embeddings = dataset.compute_embeddings(model)



.. _model-zoo-dinov2-vitg14-torch:

dinov2-vitg14-torch
___________________

DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-g/14.

**Details**

-   Model name: ``dinov2-vitg14-torch``
-   Model source: https://github.com/facebookresearch/dinov2
-   Model size: 4.23 GB
-   Exposes embeddings? yes
-   Tags: ``embeddings, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("dinov2-vitg14-torch")

    embeddings = dataset.compute_embeddings(model)



.. _model-zoo-dinov2-vitl14-torch:

dinov2-vitl14-torch
___________________

DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-L/14 distilled.

**Details**

-   Model name: ``dinov2-vitl14-torch``
-   Model source: https://github.com/facebookresearch/dinov2
-   Model size: 1.13 GB
-   Exposes embeddings? yes
-   Tags: ``embeddings, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("dinov2-vitl14-torch")

    embeddings = dataset.compute_embeddings(model)



.. _model-zoo-dinov2-vits14-torch:

dinov2-vits14-torch
___________________

DINOv2: Learning Robust Visual Features without Supervision. Model: ViT-S/14 distilled.

**Details**

-   Model name: ``dinov2-vits14-torch``
-   Model source: https://github.com/facebookresearch/dinov2
-   Model size: 84.19 MB
-   Exposes embeddings? yes
-   Tags: ``embeddings, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("dinov2-vits14-torch")

    embeddings = dataset.compute_embeddings(model)



.. _model-zoo-faster-rcnn-resnet50-fpn-coco-torch:

faster-rcnn-resnet50-fpn-coco-torch
___________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with ResNet-50 FPN backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet50-fpn-coco-torch``
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 159.74 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 207.71 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 135.01 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 49.73 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``scipy, torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 103.81 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``scipy, torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

Keypoint R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ with ResNet-50 FPN backbone trained on COCO.

**Details**

-   Model name: ``keypoint-rcnn-resnet50-fpn-coco-torch``
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 226.05 MB
-   Exposes embeddings? no
-   Tags: ``keypoints, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 169.84 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 8.59 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 16.92 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 13.55 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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



.. _model-zoo-open-clip-torch:

open-clip-torch
_______________

OPEN CLIP text/image encoder from `Learning Transferable Visual Models From Natural Language Supervision <https://arxiv.org/abs/2103.00020>`_ trained on 400M text-image pairs.

**Details**

-   Model name: ``open-clip-torch``
-   Model source: https://github.com/mlfoundations/open_clip
-   Exposes embeddings? yes
-   Tags: ``classification, logits, embeddings, torch, clip, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision, open_clip_torch``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("open-clip-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)

    #
    # Make zero-shot predictions with custom classes
    #

    model = foz.load_zoo_model(
        "open-clip-torch",
        text_prompt="A photo of a",
        classes=["person", "dog", "cat", "bird", "car", "tree", "chair"],
    )

    dataset.apply_model(model, label_field="predictions")
    session.refresh()


.. _model-zoo-resnet101-imagenet-torch:

resnet101-imagenet-torch
________________________

ResNet-101 model from `Deep Residual Learning for Image Recognition <https://arxiv.org/abs/1512.03385>`_ trained on ImageNet.

**Details**

-   Model name: ``resnet101-imagenet-torch``
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 170.45 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 230.34 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 44.66 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 83.26 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 97.75 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 339.59 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 95.79 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 130.27 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch``

**Requirements**

-   Packages: ``torch, torchvision>=0.8.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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



.. _model-zoo-rtdetr-l-coco-torch:

rtdetr-l-coco-torch
___________________

RT-DETR-l model trained on COCO.

**Details**

-   Model name: ``rtdetr-l-coco-torch``
-   Model source: https://docs.ultralytics.com/models/rtdetr/
-   Model size: 63.43 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, transformer``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.2.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("rtdetr-l-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-rtdetr-x-coco-torch:

rtdetr-x-coco-torch
___________________

RT-DETR-x model trained on COCO.

**Details**

-   Model name: ``rtdetr-x-coco-torch``
-   Model source: https://docs.ultralytics.com/models/rtdetr/
-   Model size: 129.47 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, transformer``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.2.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("rtdetr-x-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-2-hiera-base-plus-image-torch:

segment-anything-2-hiera-base-plus-image-torch
______________________________________________

Segment Anything Model 2 (SAM2) from `SAM2: Segment Anything in Images and Videos <https://arxiv.org/abs/2408.00714>`_.

**Details**

-   Model name: ``segment-anything-2-hiera-base-plus-image-torch``
-   Model source: https://ai.meta.com/sam2/
-   Model size: 148.68 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, torch, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("segment-anything-2-hiera-base-plus-image-torch")

    # Segment inside boxes
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="ground_truth",  # can contain Detections or Keypoints
    )

    # Full automatic segmentations
    dataset.apply_model(model, label_field="auto")

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-2-hiera-base-plus-video-torch:

segment-anything-2-hiera-base-plus-video-torch
______________________________________________

Segment Anything Model 2 (SAM2) from `SAM2: Segment Anything in Images and Videos <https://arxiv.org/abs/2408.00714>`_.

**Details**

-   Model name: ``segment-anything-2-hiera-base-plus-video-torch``
-   Model source: https://ai.meta.com/sam2/
-   Model size: 148.68 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, torch, zero-shot, video``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

    # Only retain detections in the first frame
    (
        dataset
        .match_frames(F("frame_number") > 1)
        .set_field("frames.detections", None)
        .save()
    )

    model = foz.load_zoo_model("segment-anything-2-hiera-base-plus-video-torch")

    # Segment inside boxes and propagate to all frames
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="frames.detections",  # can contain Detections or Keypoints
    )

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-2-hiera-large-image-torch:

segment-anything-2-hiera-large-image-torch
__________________________________________

Segment Anything Model 2 (SAM2) from `SAM2: Segment Anything in Images and Videos <https://arxiv.org/abs/2408.00714>`_.

**Details**

-   Model name: ``segment-anything-2-hiera-large-image-torch``
-   Model source: https://ai.meta.com/sam2/
-   Model size: 148.68 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, torch, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("segment-anything-2-hiera-large-image-torch")

    # Segment inside boxes
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="ground_truth",  # can contain Detections or Keypoints
    )

    # Full automatic segmentations
    dataset.apply_model(model, label_field="auto")

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-2-hiera-large-video-torch:

segment-anything-2-hiera-large-video-torch
__________________________________________

Segment Anything Model 2 (SAM2) from `SAM2: Segment Anything in Images and Videos <https://arxiv.org/abs/2408.00714>`_.

**Details**

-   Model name: ``segment-anything-2-hiera-large-video-torch``
-   Model source: https://ai.meta.com/sam2/
-   Model size: 148.68 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, torch, zero-shot, video``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

    # Only retain detections in the first frame
    (
        dataset
        .match_frames(F("frame_number") > 1)
        .set_field("frames.detections", None)
        .save()
    )

    model = foz.load_zoo_model("segment-anything-2-hiera-large-video-torch")

    # Segment inside boxes and propagate to all frames
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="frames.detections",  # can contain Detections or Keypoints
    )

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-2-hiera-small-image-torch:

segment-anything-2-hiera-small-image-torch
__________________________________________

Segment Anything Model 2 (SAM2) from `SAM2: Segment Anything in Images and Videos <https://arxiv.org/abs/2408.00714>`_.

**Details**

-   Model name: ``segment-anything-2-hiera-small-image-torch``
-   Model source: https://ai.meta.com/sam2/
-   Model size: 148.68 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, torch, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("segment-anything-2-hiera-small-image-torch")

    # Segment inside boxes
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="ground_truth",  # can contain Detections or Keypoints
    )

    # Full automatic segmentations
    dataset.apply_model(model, label_field="auto")

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-2-hiera-small-video-torch:

segment-anything-2-hiera-small-video-torch
__________________________________________

Segment Anything Model 2 (SAM2) from `SAM2: Segment Anything in Images and Videos <https://arxiv.org/abs/2408.00714>`_.

**Details**

-   Model name: ``segment-anything-2-hiera-small-video-torch``
-   Model source: https://ai.meta.com/sam2/
-   Model size: 148.68 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, torch, zero-shot, video``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

    # Only retain detections in the first frame
    (
        dataset
        .match_frames(F("frame_number") > 1)
        .set_field("frames.detections", None)
        .save()
    )

    model = foz.load_zoo_model("segment-anything-2-hiera-small-video-torch")

    # Segment inside boxes and propagate to all frames
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="frames.detections",  # can contain Detections or Keypoints
    )

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-2-hiera-tiny-image-torch:

segment-anything-2-hiera-tiny-image-torch
_________________________________________

Segment Anything Model 2 (SAM2) from `SAM2: Segment Anything in Images and Videos <https://arxiv.org/abs/2408.00714>`_.

**Details**

-   Model name: ``segment-anything-2-hiera-tiny-image-torch``
-   Model source: https://ai.meta.com/sam2/
-   Model size: 148.68 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, torch, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("segment-anything-2-hiera-tiny-image-torch")

    # Segment inside boxes
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="ground_truth",  # can contain Detections or Keypoints
    )

    # Full automatic segmentations
    dataset.apply_model(model, label_field="auto")

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-2-hiera-tiny-video-torch:

segment-anything-2-hiera-tiny-video-torch
_________________________________________

Segment Anything Model 2 (SAM2) from `SAM2: Segment Anything in Images and Videos <https://arxiv.org/abs/2408.00714>`_.

**Details**

-   Model name: ``segment-anything-2-hiera-tiny-video-torch``
-   Model source: https://ai.meta.com/sam2/
-   Model size: 148.68 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, torch, zero-shot, video``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

    # Only retain detections in the first frame
    (
        dataset
        .match_frames(F("frame_number") > 1)
        .set_field("frames.detections", None)
        .save()
    )

    model = foz.load_zoo_model("segment-anything-2-hiera-tiny-video-torch")

    # Segment inside boxes and propagate to all frames
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="frames.detections",  # can contain Detections or Keypoints
    )

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-vitb-torch:

segment-anything-vitb-torch
___________________________

Segment Anything Model (SAM) from `Segment Anything <https://arxiv.org/abs/2304.02643>`_ with ViT-B/16 backbone trained on SA-1B.

**Details**

-   Model name: ``segment-anything-vitb-torch``
-   Model source: https://segment-anything.com
-   Model size: 715.34 KB
-   Exposes embeddings? no
-   Tags: ``segment-anything, sa-1b, torch, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision, segment-anything``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("segment-anything-vitb-torch")

    # Segment inside boxes
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="ground_truth",  # can contain Detections or Keypoints
    )

    # Full automatic segmentations
    dataset.apply_model(model, label_field="auto")

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-vith-torch:

segment-anything-vith-torch
___________________________

Segment Anything Model (SAM) from `Segment Anything <https://arxiv.org/abs/2304.02643>`_ with ViT-H/16 backbone trained on SA-1B.

**Details**

-   Model name: ``segment-anything-vith-torch``
-   Model source: https://segment-anything.com
-   Model size: 4.78 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, sa-1b, torch, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision, segment-anything``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("segment-anything-vith-torch")

    # Segment inside boxes
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="ground_truth",  # can contain Detections or Keypoints
    )

    # Full automatic segmentations
    dataset.apply_model(model, label_field="auto")

    session = fo.launch_app(dataset)



.. _model-zoo-segment-anything-vitl-torch:

segment-anything-vitl-torch
___________________________

Segment Anything Model (SAM) from `Segment Anything <https://arxiv.org/abs/2304.02643>`_ with ViT-L/16 backbone trained on SA-1B.

**Details**

-   Model name: ``segment-anything-vitl-torch``
-   Model source: https://segment-anything.com
-   Model size: 2.33 MB
-   Exposes embeddings? no
-   Tags: ``segment-anything, sa-1b, torch, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision, segment-anything``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("segment-anything-vitl-torch")

    # Segment inside boxes
    dataset.apply_model(
        model,
        label_field="segmentations",
        prompt_field="ground_truth",  # can contain Detections or Keypoints
    )

    # Full automatic segmentations
    dataset.apply_model(model, label_field="auto")

    session = fo.launch_app(dataset)



.. _model-zoo-segmentation-transformer-torch:

segmentation-transformer-torch
______________________________

Hugging Face Transformers model for semantic segmentation.

**Details**

-   Model name: ``segmentation-transformer-torch``
-   Model source: https://huggingface.co/docs/transformers/tasks/semantic_segmentation
-   Exposes embeddings? no
-   Tags: ``segmentation, torch, transformers``

**Requirements**

-   Packages: ``torch, torchvision, transformers``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("segmentation-transformer-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-shufflenetv2-0.5x-imagenet-torch:

shufflenetv2-0.5x-imagenet-torch
________________________________

ShuffleNetV2 model from `ShuffleNet V2: Practical Guidelines for Efficient CNN Architecture Design <https://arxiv.org/abs/1807.11164>`_ with 0.5x output channels trained on ImageNet.

**Details**

-   Model name: ``shufflenetv2-0.5x-imagenet-torch``
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 5.28 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 8.79 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 4.74 MB
-   Exposes embeddings? no
-   Tags: ``classification, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 4.79 MB
-   Exposes embeddings? no
-   Tags: ``classification, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 506.88 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 506.84 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 507.59 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 507.54 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 527.87 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 527.80 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 548.14 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 548.05 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 242.90 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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
-   Model source: https://pytorch.org/vision/main/models.html
-   Model size: 131.82 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, torch``

**Requirements**

-   Packages: ``torch, torchvision``

-   CPU support

    -   yes

-   GPU support

    -   yes

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



.. _model-zoo-yolo-nas-torch:

yolo-nas-torch
______________

YOLO-NAS is an open-source training library for advanced computer vision models. It specializes in accuracy and efficiency, supporting tasks like object detection.

**Details**

-   Model name: ``yolo-nas-torch``
-   Model source: https://github.com/Deci-AI/super-gradients
-   Exposes embeddings? no
-   Tags: ``classification, torch, yolo``

**Requirements**

-   Packages: ``torch, torchvision, super-gradients``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolo-nas-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov10l-coco-torch:

yolov10l-coco-torch
___________________

YOLOv10-L model trained on COCO.

**Details**

-   Model name: ``yolov10l-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov10/
-   Model size: 50.00 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.2.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov10l-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov10m-coco-torch:

yolov10m-coco-torch
___________________

YOLOv10-M model trained on COCO.

**Details**

-   Model name: ``yolov10m-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov10/
-   Model size: 32.09 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.2.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov10m-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov10n-coco-torch:

yolov10n-coco-torch
___________________

YOLOv10-N model trained on COCO.

**Details**

-   Model name: ``yolov10n-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov10/
-   Model size: 5.59 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.2.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov10n-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov10s-coco-torch:

yolov10s-coco-torch
___________________

YOLOv10-S model trained on COCO.

**Details**

-   Model name: ``yolov10s-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov10/
-   Model size: 15.85 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.2.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov10s-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov10x-coco-torch:

yolov10x-coco-torch
___________________

YOLOv10-X model trained on COCO.

**Details**

-   Model name: ``yolov10x-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov10/
-   Model size: 61.41 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.2.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov10x-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov5l-coco-torch:

yolov5l-coco-torch
__________________

Ultralytics YOLOv5l model trained on COCO.

**Details**

-   Model name: ``yolov5l-coco-torch``
-   Model source: https://pytorch.org/hub/ultralytics_yolov5
-   Model size: 192.88 KB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov5l-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov5m-coco-torch:

yolov5m-coco-torch
__________________

Ultralytics YOLOv5m model trained on COCO.

**Details**

-   Model name: ``yolov5m-coco-torch``
-   Model source: https://pytorch.org/hub/ultralytics_yolov5
-   Model size: 81.91 KB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov5m-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov5n-coco-torch:

yolov5n-coco-torch
__________________

Ultralytics YOLOv5n model trained on COCO.

**Details**

-   Model name: ``yolov5n-coco-torch``
-   Model source: https://pytorch.org/hub/ultralytics_yolov5
-   Model size: 7.75 KB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov5n-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov5s-coco-torch:

yolov5s-coco-torch
__________________

Ultralytics YOLOv5s model trained on COCO.

**Details**

-   Model name: ``yolov5s-coco-torch``
-   Model source: https://pytorch.org/hub/ultralytics_yolov5
-   Model size: 28.25 KB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov5s-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov5x-coco-torch:

yolov5x-coco-torch
__________________

Ultralytics YOLOv5x model trained on COCO.

**Details**

-   Model name: ``yolov5x-coco-torch``
-   Model source: https://pytorch.org/hub/ultralytics_yolov5
-   Model size: 352.05 KB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov5x-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8l-coco-torch:

yolov8l-coco-torch
__________________

Ultralytics YOLOv8l model trained on COCO.

**Details**

-   Model name: ``yolov8l-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 83.70 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8l-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8l-obb-dotav1-torch:

yolov8l-obb-dotav1-torch
________________________

YOLOv8l Oriented Bounding Box model.

**Details**

-   Model name: ``yolov8l-obb-dotav1-torch``
-   Model source: https://docs.ultralytics.com/tasks/obb/
-   Model size: 85.36 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, polylines, obb``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8l-obb-dotav1-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8l-oiv7-torch:

yolov8l-oiv7-torch
__________________

Ultralytics YOLOv8l model trained Open Images v7.

**Details**

-   Model name: ``yolov8l-oiv7-torch``
-   Model source: https://docs.ultralytics.com/datasets/detect/open-images-v7
-   Model size: 83.70 MB
-   Exposes embeddings? no
-   Tags: ``detection, oiv7, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8l-oiv7-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8l-seg-coco-torch:

yolov8l-seg-coco-torch
______________________

Ultralytics YOLOv8l Segmentation model trained on COCO.

**Details**

-   Model name: ``yolov8l-seg-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 88.11 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8l-seg-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8l-world-torch:

yolov8l-world-torch
___________________

YOLOv8l-World model.

**Details**

-   Model name: ``yolov8l-world-torch``
-   Model source: https://docs.ultralytics.com/models/yolo-world/
-   Model size: 91.23 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, zero-shot``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8l-world-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8m-coco-torch:

yolov8m-coco-torch
__________________

Ultralytics YOLOv8m model trained on COCO.

**Details**

-   Model name: ``yolov8m-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 49.70 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8m-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8m-obb-dotav1-torch:

yolov8m-obb-dotav1-torch
________________________

YOLOv8m Oriented Bounding Box model.

**Details**

-   Model name: ``yolov8m-obb-dotav1-torch``
-   Model source: https://docs.ultralytics.com/tasks/obb/
-   Model size: 50.84 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, polylines, obb``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8m-obb-dotav1-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8m-oiv7-torch:

yolov8m-oiv7-torch
__________________

Ultralytics YOLOv8m model trained Open Images v7.

**Details**

-   Model name: ``yolov8m-oiv7-torch``
-   Model source: https://docs.ultralytics.com/datasets/detect/open-images-v7
-   Model size: 49.70 MB
-   Exposes embeddings? no
-   Tags: ``detection, oiv7, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8m-oiv7-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8m-seg-coco-torch:

yolov8m-seg-coco-torch
______________________

Ultralytics YOLOv8m Segmentation model trained on COCO.

**Details**

-   Model name: ``yolov8m-seg-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 52.36 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8m-seg-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8m-world-torch:

yolov8m-world-torch
___________________

YOLOv8m-World model.

**Details**

-   Model name: ``yolov8m-world-torch``
-   Model source: https://docs.ultralytics.com/models/yolo-world/
-   Model size: 55.89 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, zero-shot``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8m-world-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8n-coco-torch:

yolov8n-coco-torch
__________________

Ultralytics YOLOv8n model trained on COCO.

**Details**

-   Model name: ``yolov8n-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 6.23 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8n-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8n-obb-dotav1-torch:

yolov8n-obb-dotav1-torch
________________________

YOLOv8n Oriented Bounding Box model.

**Details**

-   Model name: ``yolov8n-obb-dotav1-torch``
-   Model source: https://docs.ultralytics.com/tasks/obb/
-   Model size: 6.24 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, polylines, obb``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8n-obb-dotav1-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8n-oiv7-torch:

yolov8n-oiv7-torch
__________________

Ultralytics YOLOv8n model trained on Open Images v7.

**Details**

-   Model name: ``yolov8n-oiv7-torch``
-   Model source: https://docs.ultralytics.com/datasets/detect/open-images-v7
-   Model size: 6.23 MB
-   Exposes embeddings? no
-   Tags: ``detection, oiv7, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8n-oiv7-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8n-seg-coco-torch:

yolov8n-seg-coco-torch
______________________

Ultralytics YOLOv8n Segmentation model trained on COCO.

**Details**

-   Model name: ``yolov8n-seg-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 6.73 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8n-seg-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8s-coco-torch:

yolov8s-coco-torch
__________________

Ultralytics YOLOv8s model trained on COCO.

**Details**

-   Model name: ``yolov8s-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 21.53 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8s-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8s-obb-dotav1-torch:

yolov8s-obb-dotav1-torch
________________________

YOLOv8s Oriented Bounding Box model.

**Details**

-   Model name: ``yolov8s-obb-dotav1-torch``
-   Model source: https://docs.ultralytics.com/tasks/obb/
-   Model size: 22.17 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, polylines, obb``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8s-obb-dotav1-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8s-oiv7-torch:

yolov8s-oiv7-torch
__________________

Ultralytics YOLOv8s model trained on Open Images v7.

**Details**

-   Model name: ``yolov8s-oiv7-torch``
-   Model source: https://docs.ultralytics.com/datasets/detect/open-images-v7
-   Model size: 21.53 MB
-   Exposes embeddings? no
-   Tags: ``detection, oiv7, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8s-oiv7-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8s-seg-coco-torch:

yolov8s-seg-coco-torch
______________________

Ultralytics YOLOv8s Segmentation model trained on COCO.

**Details**

-   Model name: ``yolov8s-seg-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 22.79 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8s-seg-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8s-world-torch:

yolov8s-world-torch
___________________

YOLOv8s-World model.

**Details**

-   Model name: ``yolov8s-world-torch``
-   Model source: https://docs.ultralytics.com/models/yolo-world/
-   Model size: 25.91 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, zero-shot``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8s-world-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8x-coco-torch:

yolov8x-coco-torch
__________________

Ultralytics YOLOv8x model trained on COCO.

**Details**

-   Model name: ``yolov8x-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 130.53 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8x-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8x-obb-dotav1-torch:

yolov8x-obb-dotav1-torch
________________________

YOLOv8x Oriented Bounding Box model.

**Details**

-   Model name: ``yolov8x-obb-dotav1-torch``
-   Model source: https://docs.ultralytics.com/tasks/obb/
-   Model size: 133.07 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, polylines, obb``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8x-obb-dotav1-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8x-oiv7-torch:

yolov8x-oiv7-torch
__________________

Ultralytics YOLOv8x model trained Open Images v7.

**Details**

-   Model name: ``yolov8x-oiv7-torch``
-   Model source: https://docs.ultralytics.com/datasets/detect/open-images-v7
-   Model size: 130.53 MB
-   Exposes embeddings? no
-   Tags: ``detection, oiv7, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8x-oiv7-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8x-seg-coco-torch:

yolov8x-seg-coco-torch
______________________

Ultralytics YOLOv8x Segmentation model trained on COCO.

**Details**

-   Model name: ``yolov8x-seg-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov8/
-   Model size: 137.40 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8x-seg-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov8x-world-torch:

yolov8x-world-torch
___________________

YOLOv8x-World model.

**Details**

-   Model name: ``yolov8x-world-torch``
-   Model source: https://docs.ultralytics.com/models/yolo-world/
-   Model size: 141.11 MB
-   Exposes embeddings? no
-   Tags: ``detection, torch, yolo, zero-shot``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov8x-world-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov9c-coco-torch:

yolov9c-coco-torch
__________________

YOLOv9-C model trained on COCO.

**Details**

-   Model name: ``yolov9c-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov9/
-   Model size: 49.40 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov9c-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov9c-seg-coco-torch:

yolov9c-seg-coco-torch
______________________

YOLOv9-C Segmentation model trained on COCO.

**Details**

-   Model name: ``yolov9c-seg-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov9/#__tabbed_1_2
-   Model size: 107.20 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.42``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov9c-seg-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov9e-coco-torch:

yolov9e-coco-torch
__________________

YOLOv9-E model trained on COCO.

**Details**

-   Model name: ``yolov9e-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov9/
-   Model size: 112.09 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.0``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov9e-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-yolov9e-seg-coco-torch:

yolov9e-seg-coco-torch
______________________

YOLOv9-E Segmentation model trained on COCO.

**Details**

-   Model name: ``yolov9e-seg-coco-torch``
-   Model source: https://docs.ultralytics.com/models/yolov9/#__tabbed_1_2
-   Model size: 232.20 MB
-   Exposes embeddings? no
-   Tags: ``segmentation, coco, torch, yolo``

**Requirements**

-   Packages: ``torch>=1.7.0, torchvision>=0.8.1, ultralytics>=8.1.42``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("yolov9e-seg-coco-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-zero-shot-classification-transformer-torch:

zero-shot-classification-transformer-torch
__________________________________________

Hugging Face Transformers model for zero-shot image classification.

**Details**

-   Model name: ``zero-shot-classification-transformer-torch``
-   Model source: https://huggingface.co/docs/transformers/tasks/zero_shot_image_classification
-   Exposes embeddings? yes
-   Tags: ``classification, logits, embeddings, torch, transformers, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision, transformers``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("zero-shot-classification-transformer-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-zero-shot-detection-transformer-torch:

zero-shot-detection-transformer-torch
_____________________________________

Hugging Face Transformers model for zero-shot object detection.

**Details**

-   Model name: ``zero-shot-detection-transformer-torch``
-   Model source: https://huggingface.co/docs/transformers/tasks/zero_shot_object_detection
-   Exposes embeddings? yes
-   Tags: ``detection, logits, embeddings, torch, transformers, zero-shot``

**Requirements**

-   Packages: ``torch, torchvision, transformers``

-   CPU support

    -   yes

-   GPU support

    -   yes

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

    model = foz.load_zoo_model("zero-shot-detection-transformer-torch")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-tensorflow-models:

TensorFlow models
-----------------

.. _model-zoo-centernet-hg104-1024-coco-tf2:

centernet-hg104-1024-coco-tf2
_____________________________

CenterNet model from `Objects as Points <https://arxiv.org/abs/1904.07850>`_ with the Hourglass-104 backbone trained on COCO resized to 1024x1024.

**Details**

-   Model name: ``centernet-hg104-1024-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 1.33 GB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("centernet-hg104-1024-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-centernet-hg104-512-coco-tf2:

centernet-hg104-512-coco-tf2
____________________________

CenterNet model from `Objects as Points <https://arxiv.org/abs/1904.07850>`_ with the Hourglass-104 backbone trained on COCO resized to 512x512.

**Details**

-   Model name: ``centernet-hg104-512-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 1.49 GB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("centernet-hg104-512-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-centernet-mobilenet-v2-fpn-512-coco-tf2:

centernet-mobilenet-v2-fpn-512-coco-tf2
_______________________________________

CenterNet model from `Objects as Points <https://arxiv.org/abs/1904.07850>`_ with the MobileNetV2 backbone trained on COCO resized to 512x512.

**Details**

-   Model name: ``centernet-mobilenet-v2-fpn-512-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 41.98 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("centernet-mobilenet-v2-fpn-512-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-centernet-resnet101-v1-fpn-512-coco-tf2:

centernet-resnet101-v1-fpn-512-coco-tf2
_______________________________________

CenterNet model from `Objects as Points <https://arxiv.org/abs/1904.07850>`_ with the ResNet-101v1 backbone + FPN trained on COCO resized to 512x512.

**Details**

-   Model name: ``centernet-resnet101-v1-fpn-512-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 329.96 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("centernet-resnet101-v1-fpn-512-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-centernet-resnet50-v1-fpn-512-coco-tf2:

centernet-resnet50-v1-fpn-512-coco-tf2
______________________________________

CenterNet model from `Objects as Points <https://arxiv.org/abs/1904.07850>`_ with the ResNet-50-v1 backbone + FPN trained on COCO resized to 512x512.

**Details**

-   Model name: ``centernet-resnet50-v1-fpn-512-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 194.61 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("centernet-resnet50-v1-fpn-512-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-centernet-resnet50-v2-512-coco-tf2:

centernet-resnet50-v2-512-coco-tf2
__________________________________

CenterNet model from `Objects as Points <https://arxiv.org/abs/1904.07850>`_ with the ResNet-50v2 backbone trained on COCO resized to 512x512.

**Details**

-   Model name: ``centernet-resnet50-v2-512-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 226.95 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("centernet-resnet50-v2-512-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



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

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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



.. _model-zoo-efficientdet-d0-512-coco-tf2:

efficientdet-d0-512-coco-tf2
____________________________

EfficientDet-D0 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO resized to 512x512.

**Details**

-   Model name: ``efficientdet-d0-512-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 29.31 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("efficientdet-d0-512-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-efficientdet-d0-coco-tf1:

efficientdet-d0-coco-tf1
________________________

EfficientDet-D0 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d0-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 38.20 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU support

    -   yes
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



.. _model-zoo-efficientdet-d1-640-coco-tf2:

efficientdet-d1-640-coco-tf2
____________________________

EfficientDet-D1 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO resized to 640x640.

**Details**

-   Model name: ``efficientdet-d1-640-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 49.44 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("efficientdet-d1-640-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-efficientdet-d1-coco-tf1:

efficientdet-d1-coco-tf1
________________________

EfficientDet-D1 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d1-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 61.64 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU support

    -   yes
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



.. _model-zoo-efficientdet-d2-768-coco-tf2:

efficientdet-d2-768-coco-tf2
____________________________

EfficientDet-D2 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO resized to 768x768.

**Details**

-   Model name: ``efficientdet-d2-768-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 60.01 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("efficientdet-d2-768-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-efficientdet-d2-coco-tf1:

efficientdet-d2-coco-tf1
________________________

EfficientDet-D2 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d2-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 74.00 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU support

    -   yes
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



.. _model-zoo-efficientdet-d3-896-coco-tf2:

efficientdet-d3-896-coco-tf2
____________________________

EfficientDet-D3 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO resized to 896x896.

**Details**

-   Model name: ``efficientdet-d3-896-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 88.56 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("efficientdet-d3-896-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-efficientdet-d3-coco-tf1:

efficientdet-d3-coco-tf1
________________________

EfficientDet-D3 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d3-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 106.44 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU support

    -   yes
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



.. _model-zoo-efficientdet-d4-1024-coco-tf2:

efficientdet-d4-1024-coco-tf2
_____________________________

EfficientDet-D4 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO resized to 1024x1024.

**Details**

-   Model name: ``efficientdet-d4-1024-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 151.15 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("efficientdet-d4-1024-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-efficientdet-d4-coco-tf1:

efficientdet-d4-coco-tf1
________________________

EfficientDet-D4 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d4-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 175.33 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU support

    -   yes
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



.. _model-zoo-efficientdet-d5-1280-coco-tf2:

efficientdet-d5-1280-coco-tf2
_____________________________

EfficientDet-D5 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO resized to 1280x1280.

**Details**

-   Model name: ``efficientdet-d5-1280-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 244.41 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("efficientdet-d5-1280-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-efficientdet-d5-coco-tf1:

efficientdet-d5-coco-tf1
________________________

EfficientDet-D5 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d5-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 275.81 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU support

    -   yes
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



.. _model-zoo-efficientdet-d6-1280-coco-tf2:

efficientdet-d6-1280-coco-tf2
_____________________________

EfficientDet-D6 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO resized to 1280x1280.

**Details**

-   Model name: ``efficientdet-d6-1280-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 375.63 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("efficientdet-d6-1280-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-efficientdet-d6-coco-tf1:

efficientdet-d6-coco-tf1
________________________

EfficientDet-D6 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO.

**Details**

-   Model name: ``efficientdet-d6-coco-tf1``
-   Model source: https://github.com/voxel51/automl/tree/master/efficientdet
-   Model size: 416.43 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=1.14,<2``

-   GPU support

    -   yes
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



.. _model-zoo-efficientdet-d7-1536-coco-tf2:

efficientdet-d7-1536-coco-tf2
_____________________________

EfficientDet-D7 model from `EfficientDet: Scalable and Efficient Object Detection <https://arxiv.org/abs/1911.09070>`_ trained on COCO resized to 1536x1536.

**Details**

-   Model name: ``efficientdet-d7-1536-coco-tf2``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 376.20 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("efficientdet-d7-1536-coco-tf2")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-inception-resnet-atrous-v2-coco-tf:

faster-rcnn-inception-resnet-atrous-v2-coco-tf
______________________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ atrous version with Inception backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-inception-resnet-atrous-v2-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 234.46 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-inception-resnet-atrous-v2-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf:

faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf
___________________________________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ atrous version with low-proposals and Inception backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 234.46 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-inception-resnet-atrous-v2-lowproposals-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-inception-v2-coco-tf:

faster-rcnn-inception-v2-coco-tf
________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with Inception v2 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-inception-v2-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 52.97 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-inception-v2-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-nas-coco-tf:

faster-rcnn-nas-coco-tf
_______________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with NAS-net backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-nas-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 404.95 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-nas-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-nas-lowproposals-coco-tf:

faster-rcnn-nas-lowproposals-coco-tf
____________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with low-proposals and NAS-net backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-nas-lowproposals-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 404.88 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-nas-lowproposals-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-resnet101-coco-tf:

faster-rcnn-resnet101-coco-tf
_____________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet101-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 186.41 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-resnet101-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-resnet101-lowproposals-coco-tf:

faster-rcnn-resnet101-lowproposals-coco-tf
__________________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with low-proposals and ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet101-lowproposals-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 186.41 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-resnet101-lowproposals-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-resnet50-coco-tf:

faster-rcnn-resnet50-coco-tf
____________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet50-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 113.57 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-resnet50-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-faster-rcnn-resnet50-lowproposals-coco-tf:

faster-rcnn-resnet50-lowproposals-coco-tf
_________________________________________

Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with low-proposals and ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``faster-rcnn-resnet50-lowproposals-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 113.57 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("faster-rcnn-resnet50-lowproposals-coco-tf")

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
-   Tags: ``classification, embeddings, logits, imagenet, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow<2``

-   GPU support

    -   yes
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
-   Tags: ``classification, embeddings, logits, imagenet, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow<2``

-   GPU support

    -   yes
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



.. _model-zoo-mask-rcnn-inception-resnet-v2-atrous-coco-tf:

mask-rcnn-inception-resnet-v2-atrous-coco-tf
____________________________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ atrous version with Inception backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-inception-resnet-v2-atrous-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 254.51 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("mask-rcnn-inception-resnet-v2-atrous-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-mask-rcnn-inception-v2-coco-tf:

mask-rcnn-inception-v2-coco-tf
______________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ with Inception backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-inception-v2-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 64.03 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("mask-rcnn-inception-v2-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-mask-rcnn-resnet101-atrous-coco-tf:

mask-rcnn-resnet101-atrous-coco-tf
__________________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ atrous version with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-resnet101-atrous-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 211.56 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("mask-rcnn-resnet101-atrous-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-mask-rcnn-resnet50-atrous-coco-tf:

mask-rcnn-resnet50-atrous-coco-tf
_________________________________

Mask R-CNN model from `Mask R-CNN <https://arxiv.org/abs/1703.06870>`_ atrous version with ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``mask-rcnn-resnet50-atrous-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 138.29 MB
-   Exposes embeddings? no
-   Tags: ``instances, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("mask-rcnn-resnet50-atrous-coco-tf")

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
-   Tags: ``classification, embeddings, logits, imagenet, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow<2``

-   GPU support

    -   yes
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
-   Tags: ``classification, embeddings, logits, imagenet, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow<2``

-   GPU support

    -   yes
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
-   Tags: ``classification, embeddings, logits, imagenet, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow<2``

-   GPU support

    -   yes
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



.. _model-zoo-rfcn-resnet101-coco-tf:

rfcn-resnet101-coco-tf
______________________

R-FCN object detection model from `R-FCN: Object Detection via Region-based Fully Convolutional Networks <https://arxiv.org/abs/1605.06409>`_ with ResNet-101 backbone trained on COCO.

**Details**

-   Model name: ``rfcn-resnet101-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 208.16 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("rfcn-resnet101-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-ssd-inception-v2-coco-tf:

ssd-inception-v2-coco-tf
________________________

Inception Single Shot Detector model from `SSD: Single Shot MultiBox Detector <https://arxiv.org/abs/1512.02325>`_ trained on COCO.

**Details**

-   Model name: ``ssd-inception-v2-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 97.50 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("ssd-inception-v2-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-ssd-mobilenet-v1-coco-tf:

ssd-mobilenet-v1-coco-tf
________________________

Single Shot Detector model from `SSD: Single Shot MultiBox Detector <https://arxiv.org/abs/1512.02325>`_ with MobileNetV1 backbone trained on COCO.

**Details**

-   Model name: ``ssd-mobilenet-v1-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 27.83 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("ssd-mobilenet-v1-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-ssd-mobilenet-v1-fpn-640-coco17:

ssd-mobilenet-v1-fpn-640-coco17
_______________________________

MobileNetV1 model from `MobileNetV2: Inverted Residuals and Linear Bottlenecks <https://arxiv.org/pdf/1801.04381.pdf>`_ resized to 640x640.

**Details**

-   Model name: ``ssd-mobilenet-v1-fpn-640-coco17``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 43.91 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("ssd-mobilenet-v1-fpn-640-coco17")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-ssd-mobilenet-v1-fpn-coco-tf:

ssd-mobilenet-v1-fpn-coco-tf
____________________________

FPN Single Shot Detector model from `SSD: Single Shot MultiBox Detector <https://arxiv.org/abs/1512.02325>`_ with MobileNetV1 backbone trained on COCO.

**Details**

-   Model name: ``ssd-mobilenet-v1-fpn-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 48.97 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("ssd-mobilenet-v1-fpn-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-ssd-mobilenet-v2-320-coco17:

ssd-mobilenet-v2-320-coco17
___________________________

MobileNetV2 model from `MobileNetV2: Inverted Residuals and Linear Bottlenecks <https://arxiv.org/pdf/1801.04381.pdf>`_ resized to 320x320.

**Details**

-   Model name: ``ssd-mobilenet-v2-320-coco17``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf2_detection_zoo.md
-   Model size: 43.91 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf2``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow>=2|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu>=2|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("ssd-mobilenet-v2-320-coco17")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-ssd-resnet50-fpn-coco-tf:

ssd-resnet50-fpn-coco-tf
________________________

FPN Single Shot Detector model from `SSD: Single Shot MultiBox Detector <https://arxiv.org/abs/1512.02325>`_ with ResNet-50 backbone trained on COCO.

**Details**

-   Model name: ``ssd-resnet50-fpn-coco-tf``
-   Model source: https://github.com/tensorflow/models/blob/archive/research/object_detection/g3doc/tf1_detection_zoo.md
-   Model size: 128.07 MB
-   Exposes embeddings? no
-   Tags: ``detection, coco, tf``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow|tensorflow-macos``

-   GPU support

    -   yes
    -   Packages: ``tensorflow-gpu|tensorflow>=2|tensorflow-macos``

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

    model = foz.load_zoo_model("ssd-resnet50-fpn-coco-tf")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)



.. _model-zoo-vgg16-imagenet-tf1:

vgg16-imagenet-tf1
__________________

VGG-16 model from `Very Deep Convolutional Networks for Large-Scale Image Recognition <https://arxiv.org/abs/1409.1556>`_ trained on ImageNet.

**Details**

-   Model name: ``vgg16-imagenet-tf1``
-   Model source: https://gist.github.com/ksimonyan/211839e770f7b538e2d8#file-readme-md
-   Model size: 527.80 MB
-   Exposes embeddings? yes
-   Tags: ``classification, embeddings, logits, imagenet, tf1``

**Requirements**

-   CPU support

    -   yes
    -   Packages: ``tensorflow<2``

-   GPU support

    -   yes
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

    model = foz.load_zoo_model("vgg16-imagenet-tf1")

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

-   CPU support

    -   yes
    -   Packages: ``tensorflow<2``

-   GPU support

    -   yes
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

