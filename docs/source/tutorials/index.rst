.. _tutorials:

FiftyOne Tutorials
==================

.. default-role:: code

Each tutorial below is a curated demonstration of how FiftyOne can help refine
your datasets and turn your good models into *great models*.

.. Tutorial cards section -----------------------------------------------------

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

.. Add tutorial cards below

.. customcarditem::
    :header: Integrating Cosmos-Transfer 2.5 with FiftyOne __SUB_NEW__
    :description: Learn how to integrate NVIDIA Cosmos-Transfer 2.5, a world foundation model for Physical AI, with FiftyOne to curate, visualize, and process multimodal datasets for robotics and autonomous systems.
    :link: cosmos-transfer-integration.html
    :image: https://cdn.voxel51.com/cosmos.webp
    :tags: Dataset-Scarcity,Visualization,NVIDIA,Cosmos-Transfer

.. customcarditem::
    :header: Google Gemini Vision in FiftyOne __SUB_NEW__
    :description: Leverage Google Gemini Vision's multimodal AI to analyze datasets, detect biases, generate synthetic images, and improve data quality with FiftyOne.
    :link: gemini_vision.html
    :image: https://cdn.voxel51.com/tutorial_gemini_vision/editing_images.webp
    :tags: Dataset-Evaluation,Dataset-Curation,Model-Evaluation,Brain,Plugins

.. customcarditem::
    :header: Exploring Kaputt Dataset
    :description: Learn how to work with the Kaputt dataset in FiftyOne.
    :link: kaputt_dataset.html
    :image: https://cdn.voxel51.com/kaputt_overview.webp
    :tags: Dataset-Evaluation

.. customcarditem::
    :header: DINOv3 visual search
    :description: Leverage the power of DINOv3 embeddings for visual search, similarity analysis, and foreground segmentation in FiftyOne. Learn to compute embeddings, visualize them, and build classifiers using this state-of-the-art vision model.
    :link: dinov3.html
    :image: https://cdn.voxel51.com/tutorial_dinov3/dinov3.png
    :tags: Embeddings,Brain,Model-Evaluation,Visualization

.. customcarditem::
    :header: pandas-style queries in FiftyOne
    :description: Translate your pandas knowledge to FiftyOne. This tutorial gives a side-by-side comparison of performing common operations in pandas and FiftyOne.
    :link: pandas_comparison.html
    :image: ../_images/brain-mnist.png
    :tags: Filtering,Dataset-Evaluation

.. customcarditem::
    :header: Evaluating object detections
    :description: Aggregate statistics aren't sufficient for object detection. This tutorial shows how to use FiftyOne to perform powerful evaluation workflows on your detector.
    :link: evaluate_detections.html
    :image: ../_images/evaluate_detections_dataset.jpg
    :tags: Model-Evaluation

.. customcarditem::
    :header: Evaluating a classifier
    :description: Evaluation made easy. This tutorial walks through an end-to-end example of fine-tuning a classifier and understanding its failure modes using FiftyOne.
    :link: evaluate_classifications.html
    :image: ../_images/model-evaluation-confusion.gif
    :tags: Model-Evaluation

.. customcarditem::
    :header: Using image embeddings
    :description: Visualize your data in new ways. This tutorial shows how to use FiftyOne's powerful embeddings visualization capabilities to improve your image datasets.
    :link: image_embeddings.html
    :image: ../_images/image_embeddings_test_split.png
    :tags: Visualization,Brain,Embeddings

.. customcarditem::
    :header: Annotating with CVAT
    :description: So you've loaded and explored your data in FiftyOne... but now what? See how to send it off to CVAT for annotation in just one line of code.
    :link: cvat_annotation.html
    :image: ../_images/cvat_segmentation.png
    :tags: Annotation,Dataset-Evaluation

.. customcarditem::
    :header: Annotating with Labelbox
    :description: Unlock the power of the Labelbox platform. See how you can get your FiftyOne datasets annotated with just one line of code.
    :link: labelbox_annotation.html
    :image: ../_images/labelbox_detection.png
    :tags: Annotation,Dataset-Evaluation

.. customcarditem::
    :header: Training with Detectron2
    :description: Put your FiftyOne datasets to work and learn how to train and evaluate Detectron2 models directly on your data.
    :link: detectron2.html
    :image: ../_images/open-images-v7.png
    :tags: Model-Training,Model-Evaluation

.. customcarditem::
    :header: Downloading and evaluating Open Images
    :description: Expand your data lake and evaluate your object detection models with Google's Open Images dataset and evaluation protocol, all natively within FiftyOne.
    :link: open_images.html
    :image: ../_images/open-images-v7.png
    :tags: Dataset-Evaluation,Model-Evaluation,Dataset-Zoo

.. customcarditem::
    :header: Exploring image uniqueness
    :description: Your models need diverse data. This tutorial shows how FiftyOne can remove near-duplicate images and recommend unique samples for model training.
    :link: uniqueness.html
    :image: ../_images/brain-cifar10-unique-viz.png
    :tags: Dataset-Evaluation,Brain

.. customcarditem::
    :header: Finding classification mistakes
    :description: Better models start with better data. This tutorial shows how FiftyOne can automatically find label mistakes in your classification datasets.
    :link: classification_mistakes.html
    :image: ../_images/zero_shot_classification_all_wrong_view.png
    :tags: Dataset-Evaluation,Brain

.. customcarditem::
    :header: Finding detection mistakes
    :description: How good are your ground truth objects? Use the FiftyOne Brain's mistakenness feature to find annotation errors in your object detections.
    :link: detection_mistakes.html
    :image: ../_images/detection_mistakes_full_dataset.png
    :tags: Dataset-Evaluation,Brain

.. customcarditem::
    :header: Nearest Neighbor Embeddings Classification with Qdrant
    :description: Easily pre-annotate your FiftyOne datasets using approximate nearest neighbors search on embeddings with Qdrant.
    :link: qdrant.html
    :image: ../_images/places-validation.png
    :tags: Dataset-Evaluation,Model-Evaluation,Embeddings

.. customcarditem::
    :header: Fine-tuning YOLOv8 model predictions
    :description: Visualize and evaluate YOLOv8 model predictions before fine-tuning for your custom use case.
    :link: yolov8.html
    :image: ../_images/yolov8_coco_val_predictions.png
    :tags: Model-Evaluation

.. customcarditem::
    :header: Build 3D point cloud datasets with Point-E
    :description: Lidar is expensive. This tutorial shows how FiftyOne can help you construct high quality 3D point cloud datasets using Point-E point cloud models.
    :link: pointe.html
    :image: ../_images/pointe_preview.gif
    :tags: Dataset-Curation,Filtering,Visualization

.. customcarditem::
    :header: Monocular Depth Estimation with Hugging Face
    :description: Metrics for monocular depth estimation can be deceiving. Run MDE models on your data and visualize their predictions with FiftyOne.
    :link: monocular_depth_estimation.html
    :image: ../_images/mde_gt_heatmaps.png
    :tags: Model-Evaluation,Visualization

.. customcarditem::
    :header: Visualizing Data with Dimensionality Reduction
    :description: Compare and contrast dimensionality reduction techniques for visualizing your data in FiftyOne.
    :link: dimension_reduction.html
    :image: ../_images/dimension_reduction_cifar10_base_dataset.png
    :tags: Brain,Visualization

.. customcarditem::
    :header: Zero-Shot Image Classification
    :description: Run and evaluate zero-shot image classification models with OpenCLIP, Hugging Face Transformers, and FiftyOne.
    :link: zero_shot_classification.html
    :image: ../_images/zero_shot_classification_initial_dataset.png
    :tags: Filtering,Model-Evaluation,Model-Zoo

.. customcarditem::
    :header: Augmenting Datasets with Albumentations
    :description: Learn how to apply and test out different augmentations on your datasets using FiftyOne and Albumentations.
    :link: data_augmentation.html
    :image: ../_images/augmentations_initial_dataset.png
    :tags: App,Dataset-Curation,Visualization

.. customcarditem::
    :header: Clustering Images with Embeddings
    :description: Use embeddings to cluster images in your dataset and visualize the results in FiftyOne.
    :link: clustering.html
    :image: ../_images/clustering_preview.jpg
    :tags: App,Brain,Dataset-Curation,Embeddings,Visualization

.. customcarditem::
    :header: Small Object Detection with SAHI
    :description: Detect small objects in your images with Slicing-Aided Hyper-Inference (SAHI) and FiftyOne.
    :link: small_object_detection.html
    :image: ../_images/sahi_dataset.jpg
    :tags: Model-Evaluation,Model-Zoo

.. customcarditem::
    :header: Anomaly Detection with Anomalib
    :description: Detect anomalies in your images with Anomalib and FiftyOne.
    :link: anomaly_detection.html
    :image: ../_images/anomaly_detection_thumbnail.jpg
    :tags: Embeddings,Model-Evaluation,Model-Training,Visualization

.. End of tutorial cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End tutorial cards section -------------------------------------------------

.. note::

    Check out the
    `fiftyone-examples <https://github.com/voxel51/fiftyone-examples>`_
    repository for more examples of using FiftyOne!

.. toctree::
   :maxdepth: 1
   :hidden:

   Integrating NVIDIA Cosmos-Transfer 2.5 with FiftyOne __SUB_NEW__ <cosmos-transfer-integration.ipynb>
   Google Gemini Vision in FiftyOne __SUB_NEW__ <gemini_vision.ipynb>
   Exploring Kaputt Dataset __SUB_NEW__ <kaputt_dataset.ipynb>
   DINOv3 visual search <dinov3.ipynb>
   pandas and FiftyOne <pandas_comparison.ipynb>
   Evaluating object detections <evaluate_detections.ipynb>
   Evaluating a classifier <evaluate_classifications.ipynb>
   Using image embeddings <image_embeddings.ipynb>
   Annotating with CVAT <cvat_annotation.ipynb>
   Annotating with Labelbox <labelbox_annotation.ipynb>
   Working with Open Images <open_images.ipynb>
   Training with Detectron2 <detectron2.ipynb>
   Exploring image uniqueness <uniqueness.ipynb>
   Finding class mistakes <classification_mistakes.ipynb>
   Finding detection mistakes <detection_mistakes.ipynb>
   Embeddings with Qdrant <qdrant.ipynb>
   Fine-tuning YOLOv8 models <yolov8.ipynb>
   3D point clouds with Point-E <pointe.ipynb>
   Monocular depth estimation <monocular_depth_estimation.ipynb>
   Dimensionality reduction <dimension_reduction.ipynb>
   Zero-shot classification <zero_shot_classification.ipynb>
   Data augmentation <data_augmentation.ipynb>
   Clustering images <clustering.ipynb>
   Detecting small objects <small_object_detection.ipynb>
   Anomaly detection <anomaly_detection.ipynb>
