.. _getting-started-guides:

Getting Started Guides
======================

.. default-role:: code

Welcome to FiftyOne's guided learning experiences! These step-by-step tutorials will walk you through complete workflows, helping you master FiftyOne's capabilities through hands-on practice.

Each guide is designed as a sequential learning experience with navigation between steps, allowing you to progress through the material at your own pace.

.. Guide cards section -------------------------------------------------------

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

.. Add guide cards below

.. customcarditem::
    :header: Auto Labeling Guide
    :description: Bootstrap datasets rapidly with FiftyOne Auto Labeling. Generate auto labels with foundation models and systematically review predictions with confidence-based filtering and embeddings.
    :link: auto_labeling/index.html
    :image: https://cdn.voxel51.com/getting_started_val/notebook3/val_review_ui.webp
    :tags: FiftyOne-Enterprise,Annotation

.. customcarditem::
    :header: Human Annotation Guide
    :description: Master the data-centric annotation loop with coverage-based selection, human-in-the-loop labeling, and iterative model improvement. Learn to label smarter, not harder.
    :link: human_annotation/index.html
    :image: https://cdn.voxel51.com/getting_started_val/notebook3/val_review_ui.webp
    :tags: Core-Fiftyone,Annotation,Human-in-the-Loop


.. customcarditem::
    :header: Object Detection Guide
    :description: Master object detection workflows with COCO, YOLOv8, and comprehensive model evaluation. Learn dataset curation, mistake analysis, and performance assessment through hands-on practice.
    :link: object_detection/index.html
    :image: https://cdn.voxel51.com/dice_dataset.webp
    :tags: Core-Fiftyone,Research

.. customcarditem::
    :header: Medical Imaging Guide
    :description: Explore medical imaging workflows with DICOM, CT scans, and volumetric data. Learn to handle medical formats, create segmentation masks, and organize datasets for analysis.
    :link: medical_imaging/index.html
    :image: https://cdn.voxel51.com/all_patients_ct.webp
    :tags: Healthcare,Research

.. customcarditem::
    :header: Self-Driving Guide
    :description: Dive into autonomous vehicle data workflows with advanced techniques for sensor fusion, trajectory analysis, and multi-modal data processing for self-driving applications.
    :link: self_driving/index.html
    :image: https://cdn.voxel51.com/getting_started_self_driving/notebook1/enuscenes.webp
    :tags: Autonomous-Vehicles,Robotics

.. customcarditem::
    :header: 3D Visual AI Guide
    :description: Master 3D computer vision workflows with point clouds, mesh data, and spatial analysis. Learn to load, visualize, and analyze 3D datasets effectively.
    :link: threed_visual_ai/index.html
    :image: https://docs.voxel51.com/_images/pointe_headphones_fo.gif
    :tags: Manufacturing,Robotics,Research

.. customcarditem::
    :header: Model Evaluation Guide
    :description: Comprehensive model evaluation workflows with advanced analysis techniques. Learn to assess model performance, identify failure cases, and optimize your computer vision models.
    :link: model_evaluation/index.html
    :image: https://cdn.voxel51.com/getting_started_model_evaluation/notebook2/model_evaluation.webp
    :tags: Core-Fiftyone,Research

.. customcarditem::
    :header: Segmentation Guide
    :description: Master segmentation workflows with instance and semantic segmentation. Learn to load COCO datasets, add predictions with SAM2, and work with advanced segmentation models.
    :link: segmentation/index.html
    :image: https://cdn.voxel51.com/getting_started_segmentation/notebook1/coffe_beans.webp
    :tags: Core-Fiftyone,Research

.. customcarditem::
    :header: Depth Estimation Guide
    :description: Master depth estimation workflows with DIODE, NYU Depth V2, and multiple model approaches. Learn to load depth data, work with heatmaps, and apply models from Model Zoo, Hugging Face, and Diffusers.
    :link: depth_estimation/index.html
    :image: https://cdn.voxel51.com/getting_started_depth_estimation/notebook2/all_predicted_depths.webp
    :tags: Core-Fiftyone,Research

.. customcarditem::
    :header: Model Dataset Zoo Guide
    :description: Master the FiftyOne Zoo with datasets and models. Learn to explore built-in datasets, apply pre-trained models, and integrate custom models from GitHub or public URLs.
    :link: model_dataset_zoo/index.html
    :image: https://cdn.voxel51.com/getting_started_model_dataset_zoo/notebook2/imagenet.webp
    :tags: Core-Fiftyone,Research

.. customcarditem::
    :header: Manufacturing Guide
    :description: Complete manufacturing AI workflow with anomaly detection, defect inspection, and safety monitoring. Learn to work with MVTec datasets, embeddings, clustering, and video analytics for industrial applications.
    :link: manufacturing/index.html
    :image: https://cdn.voxel51.com/getting_started_manufacturing/notebook1/filtering.webp
    :tags: Manufacturing,Industrial-AI,Research

.. End of guide cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End guide cards section ---------------------------------------------------

.. toctree::
   :maxdepth: 1
   :hidden:

   Auto Labeling Guide <auto_labeling/index>
   Human Annotation Guide <human_annotation/index>
   Object Detection Guide <object_detection/index>
   Medical Imaging Guide <medical_imaging/index>
   Self-Driving Guide <self_driving/index>
   3D Visual AI Guide <threed_visual_ai/index>
   Model Evaluation Guide <model_evaluation/index>
   Segmentation Guide <segmentation/index>
   Depth Estimation Guide <depth_estimation/index>
   Model Dataset Zoo Guide <model_dataset_zoo/index>
   Manufacturing Guide <manufacturing/index>
