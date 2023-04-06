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
    :header: pandas-style queries in FiftyOne
    :description: Translate your pandas knowledge to FiftyOne. This tutorial gives a side-by-side comparison of performing common opertaions in pandas and FiftyOne.
    :link: pandas_comparison.html
    :image: ../_static/images/tutorials/pandas_tutorial.png
    :tags: Filtering,Dataset-Evaluation

.. customcarditem::
    :header: Evaluating object detections
    :description: Aggregate statistics aren't sufficient for object detection. This tutorial shows how to use FiftyOne to perform powerful evaluation workflows on your detector.
    :link: evaluate_detections.html
    :image: ../_static/images/tutorials/evaluate_detections.png
    :tags: Model-Evaluation

.. customcarditem::
    :header: Evaluating a classifier
    :description: Evaluation made easy. This tutorial walks through an end-to-end example of fine-tuning a classifier and understanding its failure modes using FiftyOne.
    :link: evaluate_classifications.html
    :image: ../_static/images/tutorials/evaluate_classifications.png
    :tags: Model-Evaluation

.. customcarditem::
    :header: Using image embeddings
    :description: Visualize your data in new ways. This tutorial shows how to use FiftyOne's powerful embeddings visualization capabilities to improve your image datasets.
    :link: image_embeddings.html
    :image: ../_static/images/tutorials/image_embeddings.png
    :tags: Visualization,Brain,Embeddings

.. customcarditem::
    :header: Annotating with CVAT
    :description: So you've loaded and explored your data in FiftyOne... but now what? See how to send it off to CVAT for annotation in just one line of code.
    :link: cvat_annotation.html
    :image: ../_static/images/tutorials/cvat_segmentation.png
    :tags: Annotation,Dataset-Evaluation

.. customcarditem::
    :header: Annotating with Labelbox
    :description: Unlock the power of the Labelbox platform. See how you can get your FiftyOne datasets annotated with just one line of code.
    :link: labelbox_annotation.html
    :image: ../_static/images/tutorials/labelbox_square.png
    :tags: Annotation,Dataset-Evaluation

.. customcarditem::
    :header: Training with Detectron2
    :description: Put your FiftyOne datasets to work and learn how to train and evaluate Detectron2 models directly on your data.
    :link: detectron2.html
    :image: ../_static/images/tutorials/detectron2.png
    :tags: Model-Training,Model-Evaluation

.. customcarditem::
    :header: Downloading and evaluating Open Images
    :description: Expand your data lake and evaluate your object detection models with Google's Open Images dataset and evaluation protocol, all natively within FiftyOne.
    :link: open_images.html
    :image: ../_static/images/tutorials/open_images.png
    :tags: Dataset-Evaluation,Model-Evaluation,Dataset-Zoo

.. customcarditem::
    :header: Exploring image uniqueness
    :description: Your models need diverse data. This tutorial shows how FiftyOne can remove near-duplicate images and recommend unique samples for model training.
    :link: uniqueness.html
    :image: ../_static/images/tutorials/uniqueness.png
    :tags: Dataset-Evaluation,Brain

.. customcarditem::
    :header: Finding classification mistakes
    :description: Better models start with better data. This tutorial shows how FiftyOne can automatically find label mistakes in your classification datasets.
    :link: classification_mistakes.html
    :image: ../_static/images/tutorials/classification_mistakes.png
    :tags: Dataset-Evaluation,Brain

.. customcarditem::
    :header: Finding detection mistakes
    :description: How good are your ground truth objects? Use the FiftyOne Brain's mistakenness feature to find annotation errors in your object detections.
    :link: detection_mistakes.html
    :image: ../_static/images/tutorials/detection_mistakes.png
    :tags: Dataset-Evaluation,Brain

.. customcarditem::
    :header: Nearest Neighbor Embeddings Classification with Qdrant
    :description: Easily pre-annotate your FiftyOne datasets using approximate nearest neighbors search on embeddings with Qdrant.
    :link: qdrant.html
    :image: ../_static/images/tutorials/qdrant.png
    :tags: Dataset-Evaluation,Model-Evaluation,Embeddings

.. customcarditem::
    :header: Fine-tuning YOLOv8 model predictions
    :description: Visualize and evaluate YOLOv8 model predictions before fine-tuning for your custom use case.
    :link: yolov8.html
    :image: ../_static/images/tutorials/yolov8.png
    :tags: Model-Evaluation

.. customcarditem::
    :header: Build 3D point cloud datasets with Point-E
    :description: Lidar is expensive. This tutorial shows how FiftyOne can help you construct high quality 3D point cloud datasets using Point-E point cloud models.
    :link: pointe.html
    :image: ../_static/images/tutorials/pointe.png
    :tags: Dataset-Curation,Filtering,Visualization

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
