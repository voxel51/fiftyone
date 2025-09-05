.. _getting_started_guides:

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
    :image: https://cdn.voxel51.com/getting_started_segmentation/notebook1/segmentation_overview.webp
    :tags: Core-Fiftyone,Research

.. customcarditem::
    :header: Model Dataset Zoo Guide
    :description: Master the FiftyOne Zoo with datasets and models. Learn to explore built-in datasets, apply pre-trained models, and integrate custom models from GitHub or public URLs.
    :link: model_dataset_zoo/index.html
    :image: https://cdn.voxel51.com/getting_started_model_dataset_zoo/notebook1/zoo_overview.webp
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

.. End Guide cards section ---------------------------------------------------

.. _quick-assessment:

Not sure where to start? Take our quick assessment:

**Working with object detection?** → :doc:`Explore the Object Detection Guide <object_detection/index>`

**Have medical imaging data?** → :doc:`Begin with Medical Imaging Guide <medical_imaging/index>`

**Working on autonomous vehicles?** → :doc:`Jump to Self-Driving Guide <self_driving/index>`

**Need 3D computer vision?** → :doc:`Explore 3D Visual AI Guide <threed_visual_ai/index>`

**Want to evaluate model performance?** → :doc:`Start with Model Evaluation Guide <model_evaluation/index>`

.. toctree::
   :maxdepth: 1
   :hidden:

   Object Detection Guide <object_detection/index>
   Medical Imaging Guide <medical_imaging/index>
   Self-Driving Guide <self_driving/index>
   3D Visual AI Guide <threed_visual_ai/index>
   Model Evaluation Guide <model_evaluation/index>
   Segmentation Guide <segmentation/index>
   Model Dataset Zoo Guide <model_dataset_zoo/index> 
   Manufacturing Guide <manufacturing/index>