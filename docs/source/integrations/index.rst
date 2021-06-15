.. _integrations:

FiftyOne Integrations
=====================

.. default-role:: code

FiftyOne is designed to fit into your existing workflows as easily as possible.
To this end, FiftyOne has integrated with various existing datasets, tools, and
services that you are likely using.

.. Integrations cards section -----------------------------------------------------

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
    :header: PyTorch Lightning Flash
    :description: Flash now supports FiftyOne datasets letting you train and evaluate Flash tasks on your FiftyOne datasets in minimal lines of code. 
    :link: lightning_flash.html
    :image: https://raw.githubusercontent.com/PyTorchLightning/lightning-flash/master/docs/source/_static/images/logo.svg
    :tags: Model-Training,Model-Evaluation

..
    .. customcarditem::
        :header: Google's Open Images Dataset
        :description: FiftyOne is the easiest source for downloading and exploring Open Images.
        :link: ../user_guide/dataset_zoo/datasets.html#dataset-zoo-open-images-v6
        :tags: Dataset
    
    .. customcarditem::
        :header: CVAT 
        :description: Import and export image and video datasets in CVAT format.
        :link: ../user_guide/dataset_creation/datasets.html#cvatimagedataset 
        :tags: Annotation 
    
    .. customcarditem::
        :header: Labelbox 
        :description: Download and upload your data directly to Labelbox.
        :link: ../api/fiftyone.utils.labelbox.html 
        :image: https://voxel51.com/images/integrations/labelbox-128.png
        :tags: Annotation 
    
    .. customcarditem::
        :header: Scale AI 
        :description: Import and export labels to and from the Scale AI format.
        :link: ../api/fiftyone.utils.scale.html 
        :image: https://voxel51.com/images/integrations/scale-128.png
        :tags: Annotation 

.. End of integrations cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End integrations cards section -------------------------------------------------

.. toctree::
   :maxdepth: 1
   :hidden:

   PyTorch Lightning Flash <lightning_flash.rst>
