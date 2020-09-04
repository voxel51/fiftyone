FiftyOne Recipes
================

.. default-role:: code

Welcome to FiftyOne recipes!

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
    :header: Remove duplicate images from a dataset
    :description: Turn your data into a FiftyOne Dataset and automatically find and remove duplicate and near-duplicate images from your dataset.
    :link: image_deduplication.html
    :image: ../_static/images/recipes/image_deduplication.png
    :tags: Basics,Dataset-Curation

.. customcarditem::
    :header: Add model predictions to a dataset
    :description: Add FiftyOne to your model training and analysis loop to visualize and analyze your model's predictions.
    :link: model_inference.html
    :image: ../_static/images/recipes/model_inference.png
    :tags: Basics,Model-Training

.. customcarditem::
    :header: Convert dataset formats on disk
    :description: Use FiftyOne's powerful dataset import/export features to convert your datasets on disk between standard (or custom) formats.
    :link: convert_datasets.html
    :image: ../_static/images/recipes/convert_datasets.png
    :tags: Basics,I/O

.. customcarditem::
    :header: Draw labels on samples
    :description: Render labels on the samples in your FiftyOne Dataset with a single line of code.
    :link: draw_labels.html
    :image: ../_static/images/recipes/draw_labels.png
    :tags: Basics,Visualization

.. customcarditem::
    :header: Import datasets in custom formats
    :description: Write your own custom DatasetImporter and use it to import datasets in your custom format into FiftyOne.
    :link: custom_importer.html
    :image: ../_static/images/recipes/custom_importer.png
    :tags: Advanced,I/O

.. customcarditem::
    :header: Export datasets in custom formats
    :description: Write your own custom DatasetExporter and use it to export a FiftyOne Dataset to disk in your custom format.
    :link: custom_exporter.html
    :image: ../_static/images/recipes/custom_exporter.png
    :tags: Advanced,I/O

.. customcarditem::
    :header: Parse samples in custom formats
    :description: Write your own custom SampleParser and use it to add samples in your custom format to a FiftyOne Dataset.
    :link: custom_parser.html
    :image: ../_static/images/recipes/custom_parser.png
    :tags: Advanced,I/O

.. End of recipe cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End Recipe cards section ---------------------------------------------------

.. toctree::
   :maxdepth: 1
   :hidden:

   Remove duplicate images<image_deduplication.ipynb>
   Add model predictions<model_inference.ipynb>
   Draw labels on samples<draw_labels.ipynb>
   Convert dataset formats<convert_datasets.ipynb>
   Custom dataset importers<custom_importer.ipynb>
   Custom dataset exporters<custom_exporter.ipynb>
   Custom sample parsers<custom_parser.ipynb>
