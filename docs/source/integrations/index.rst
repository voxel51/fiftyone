
.. _integrations:

FiftyOne Integrations
=====================

.. default-role:: code

FiftyOne integrates naturally with other ML tools that you know and love. Click
on the cards below to see how!

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
    :header: COCO Dataset
    :description: See how FiftyOne makes downloading, visualizing, and evaluating on the COCO dataset (or your own COCO-formatted data) a breeze.
    :link: coco.html
    :image: ../_static/images/integrations/coco.png
    :tags: Datasets,Model-Evaluation

.. customcarditem::
    :header: Open Images Dataset
    :description: See why FiftyOne is a recommended tool for downloading, visualizing, and evaluating on Google's Open Images Dataset.
    :link: open_images.html
    :image: ../_static/images/integrations/open_images.png
    :tags: Datasets,Model-Evaluation

.. customcarditem::
    :header: ActivityNet Dataset
    :description: See how to use FiftyOne to download, visualize, and evaluate on the ActivityNet dataset with ease.
    :link: activitynet.html
    :image: ../_static/images/integrations/activitynet.png
    :tags: Datasets,Model-Evaluation

.. customcarditem::
    :header: CVAT
    :description: Use our CVAT integration to easily annotate and edit your FiftyOne datasets.
    :link: cvat.html
    :image: ../_static/images/integrations/cvat.png
    :tags: Annotation

.. customcarditem::
    :header: Label Studio
    :description: Annotate and edit your FiftyOne datasets in Label Studio through our integration.
    :link: labelstudio.html
    :image: ../_static/images/integrations/labelstudio.png
    :tags: Annotation

.. customcarditem::
    :header: Labelbox
    :description: Use our Labelbox integration to get your FiftyOne datasets annotated.
    :link: labelbox.html
    :image: ../_static/images/integrations/labelbox.jpeg
    :tags: Annotation

.. customcarditem::
    :header: Qdrant
    :description: Use our Qdrant integration to enable vector search and query your FiftyOne datasets at scale.
    :link: qdrant.html
    :image: ../_static/images/integrations/qdrant.png
    :tags: Brain,Embeddings,Filtering

.. customcarditem::
    :header: Pinecone
    :description: Use our Pinecone integration to index your FiftyOne datasets and perform embeddings queries at scale.
    :link: pinecone.html
    :image: ../_static/images/integrations/pinecone.png
    :tags: Brain,Embeddings,Filtering

.. customcarditem::
    :header: Milvus
    :description: Use our Milvus integration to index your FiftyOne datasets and perform embeddings queries at scale.
    :link: milvus.html
    :image: ../_static/images/integrations/milvus.png
    :tags: Brain,Embeddings,Filtering

.. customcarditem::
    :header: LanceDB
    :description: Use our LancedDB integration to index your datasets and perform embeddings queries at scale without the need for a cloud service.
    :link: lancedb.html
    :image: ../_static/images/integrations/lancedb.png
    :tags: Brain,Embeddings,Filtering

.. customcarditem::
    :header: PyTorch Hub
    :description: Did you know? You can load any model from the PyTorch Hub and run inference on your FiftyOne datasets with just a few lines of code.
    :link: pytorch_hub.html
    :image: ../_static/images/integrations/pytorch.png
    :tags: Model-Zoo,Model-Evaluation

.. customcarditem::
    :header: Lightning Flash
    :description: Train Flash models on FiftyOne datasets and use the FiftyOne App to visualize and improve your Flash models, all with just a few lines of code.
    :link: lightning_flash.html
    :image: ../_static/images/integrations/lightning_flash.png
    :tags: Model-Training,Model-Evaluation

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

    COCO <coco.rst>
    Open Images <open_images.rst>
    ActivityNet <activitynet.rst>
    CVAT <cvat.rst>
    Label Studio <labelstudio.rst>
    Labelbox <labelbox.rst>
    Qdrant <qdrant.rst>
    Pinecone <pinecone.rst>
    Milvus <milvus.rst>
    LanceDB <lancedb.rst>
    PyTorch Hub <pytorch_hub.rst>
    Lightning Flash <lightning_flash.rst>
