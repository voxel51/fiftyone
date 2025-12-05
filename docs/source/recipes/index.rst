.. _recipes:

FiftyOne Recipes
================

.. default-role:: code

FiftyOne turbocharges your current workflows, transforming hours of scripting
into minutes so that you can focus on your models. Browse the recipes below to
see how you can leverage FiftyOne to enhance key parts of your machine learning
workflows.

.. Recipe cards section -------------------------------------------------------

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

.. Add recipe cards below

.. customcarditem::
    :header: Data Loading with Torch Datasets
    :description: Learn how to efficiently load and work with FiftyOne datasets in PyTorch using FiftyOneTorchDataset.
    :link: fiftyone_torch_dataloader.html
    :image: https://cdn.voxel51.com/recipes_sid_get_item/notebook1/sid_get_item.webp
    :tags: Basics,Dataset-Curation

.. customcarditem::
    :header: Training on MNIST with Torch
    :description: Train a simple PyTorch model on the MNIST dataset using `FiftyOneTorchDataset`, with train/validation/test splits managed in FiftyOne and a reusable training script.
    :link: torch-dataset-examples/simple_training_example.html
    :image: https://cdn.voxel51.com/recipes_fiftyone_torch_mnist_training/notebook_simple_training_example/fiftyone_torch_mnist_training.webp
    :tags: Torch,Training,Datasets

.. customcarditem::
    :header: Speeding up with cached fields
    :description: Improve training performance by preloading specific fields into memory using the `SimpleGetItem` wrapper class with `vectorize=True` in `FiftyOneTorchDataset`.
    :link: torch-dataset-examples/the_cache_field_names_argument.html
    :image: https://cdn.voxel51.com/recipes_fiftyone_torch_cache_fields/notebook_cache_field_names/fiftyone_torch_cache_fields.webp
    :tags: Torch,Performance,Data-Loading
    
.. customcarditem::
    :header: Creating views and using view expressions
    :description: Create views to easily query and explore your datasets in FiftyOne.
    :link: creating_views.html
    :image: ../_images/app-views1.gif
    :tags: Basics,Dataset-Curation

.. customcarditem::
    :header: Removing duplicate images from a dataset
    :description: Automatically find and remove duplicate and near-duplicate images from your FiftyOne datasets.
    :link: image_deduplication.html
    :image: ../_static/images/recipes/image_deduplication.png
    :tags: Basics,Dataset-Curation

.. customcarditem::
    :header: Removing duplicate objects from a dataset
    :description: Check out some common workflows for finding and removing duplicate objects from your FiftyOne datasets.
    :link: remove_duplicate_annos.html
    :image: ../_static/images/recipes/remove_duplicate_annos.png
    :tags: Basics,Dataset-Curation

.. customcarditem::
    :header: Adding classifier predictions to a dataset
    :description: Add FiftyOne to your model training and analysis loop to visualize and analyze your classifier's predictions.
    :link: adding_classifications.html
    :image: ../_images/evaluate_detections_dataset.jpg
    :tags: Basics,Model-Training

.. customcarditem::
    :header: Adding object detections to a dataset
    :description: Use FiftyOne to store your object detections and use the FiftyOne App to analyze them.
    :link: adding_detections.html
    :image: ../_images/yolov8_coco_val_predictions.png
    :tags: Basics,Model-Training

.. customcarditem::
    :header: Draw labels on samples
    :description: Render labels on the samples in your FiftyOne Dataset with a single line of code.
    :link: draw_labels.html
    :image: ../_images/draw_labels_quickstart_video.gif
    :tags: Basics,Visualization

.. customcarditem::
    :header: Convert dataset formats on disk
    :description: Use FiftyOne's powerful dataset import/export features to convert your datasets on disk between standard (or custom) formats.
    :link: convert_datasets.html
    :image: ../_images/file-explorer.gif
    :tags: Basics,I/O

.. customcarditem::
    :header: Merging datasets
    :description: Easily merge datasets on disk or in-memory using FiftyOne; e.g., to add a new set of model predictions to a dataset.
    :link: merge_datasets.html
    :image: ../_images/dynamic-groups.gif
    :tags: Basics,I/O

.. customcarditem::
    :header: Import datasets in custom formats
    :description: Write your own custom DatasetImporter and use it to import datasets in your custom format into FiftyOne.
    :link: custom_importer.html
    :image: ../_images/import.gif
    :tags: Advanced,I/O

.. customcarditem::
    :header: Export datasets in custom formats
    :description: Write your own custom DatasetExporter and use it to export a FiftyOne Dataset to disk in your custom format.
    :link: custom_exporter.html
    :image: ../_images/archive-snapshot.png
    :tags: Advanced,I/O

.. customcarditem::
    :header: Parse samples in custom formats
    :description: Write your own custom SampleParser and use it to add samples in your custom format to a FiftyOne Dataset.
    :link: custom_parser.html
    :image: ../_images/groups-grid-view.gif
    :tags: Advanced,I/O

.. End of recipe cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End Recipe cards section ---------------------------------------------------

.. note::

    Check out the
    `fiftyone-examples <https://github.com/voxel51/fiftyone-examples>`_
    repository for more examples of using FiftyOne!

.. toctree::
   :maxdepth: 1
   :hidden:

   Data Loading with Torch Datasets <fiftyone_torch_dataloader.ipynb>
   Training on MNIST with Torch <torch-dataset-examples/simple_training_example.ipynb>
   Speeding up with cached fields <torch-dataset-examples/the_cache_field_names_argument.ipynb>
   Creating views <creating_views.ipynb>
   Removing duplicate images <image_deduplication.ipynb>
   Removing duplicate objects <remove_duplicate_annos.ipynb>
   Adding classifier predictions <adding_classifications.ipynb>
   Adding object detections <adding_detections.ipynb>
   Draw labels on samples <draw_labels.ipynb>
   Convert dataset formats <convert_datasets.ipynb>
   Merging datasets <merge_datasets.ipynb>
   Custom dataset importers <custom_importer.ipynb>
   Custom dataset exporters <custom_exporter.ipynb>
   Custom sample parsers <custom_parser.ipynb>
