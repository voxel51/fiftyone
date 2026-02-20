
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
    :image: ../_images/dataset_zoo_coco_2017.png
    :tags: Datasets,Model-Evaluation

.. customcarditem::
    :header: Open Images Dataset
    :description: See why FiftyOne is a recommended tool for downloading, visualizing, and evaluating on Google's Open Images Dataset.
    :link: open_images.html
    :image: ../_images/open-images-v7.png
    :tags: Datasets,Model-Evaluation

.. customcarditem::
    :header: ActivityNet Dataset
    :description: See how to use FiftyOne to download, visualize, and evaluate on the ActivityNet dataset with ease.
    :link: activitynet.html
    :image: ../_images/activitynet_evaluate_detections.png
    :tags: Datasets,Model-Evaluation

.. customcarditem::
    :header: Integrating with Annotation Backends
    :description: Use our annotation API to send and receive annotation jobs to/from a custom or broadly popular backend like CVAT.
    :link: annotation.html
    :image: ../_static/images/integrations/annotation.png
    :tags: Annotation

.. customcarditem::
    :header: CVAT
    :description: Use our CVAT integration to easily annotate and edit your FiftyOne datasets.
    :link: cvat.html
    :image: ../_images/cvat_segmentation.png
    :tags: Annotation

.. customcarditem::
    :header: Label Studio
    :description: Annotate and edit your FiftyOne datasets in Label Studio through our integration.
    :link: labelstudio.html
    :image: ../_images/labelbox_detection.png
    :tags: Annotation

.. customcarditem::
    :header: V7
    :description: Use our V7 integration to easily annotate and edit your FiftyOne datasets.
    :link: v7.html
    :image: ../_images/v7-hero.jpg
    :tags: Annotation

.. customcarditem::
    :header: Labelbox
    :description: Use our Labelbox integration to get your FiftyOne datasets annotated.
    :link: labelbox.html
    :image: ../_images/labelbox_video.png
    :tags: Annotation

.. customcarditem::
    :header: Qdrant
    :description: Use our Qdrant integration to enable vector search and query your FiftyOne datasets at scale.
    :link: qdrant.html
    :image: ../_images/brain-image-similarity.gif
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: Redis
    :description: Use our Redis vector search integration to index your FiftyOne datasets and perform embeddings queries at scale.
    :link: redis.html
    :image: ../_images/brain-image-visualization.gif
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: Pinecone
    :description: Use our Pinecone integration to index your FiftyOne datasets and perform embeddings queries at scale.
    :link: pinecone.html
    :image: ../_images/brain-object-similarity.gif
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: MongoDB
    :description: Use our MongoDB vector search integration to index your FiftyOne datasets and perform embeddings queries at scale.
    :link: mongodb.html
    :image: ../_images/brain-object-visualization.gif
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: Elasticsearch
    :description: Use our Elasticsearch integration to enable vector search and query your FiftyOne datasets at scale.
    :link: elasticsearch.html
    :image: ../_images/brain-text-similarity.gif
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: Databricks Mosaic AI
    :description: Use our Databricks Mosaic AI integration to enable vector search and query your FiftyOne datasets at scale.
    :link: mosaic.html
    :image: ../_images/brain-representativeness.png
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: PostgreSQL Pgvector
    :description: Use our PostgreSQL Pgvector integration to enable vector search and query your FiftyOne datasets at scale.
    :link: pgvector.html
    :image: ../_images/brain-image-similarity.gif
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: Milvus
    :description: Use our Milvus integration to index your FiftyOne datasets and perform embeddings queries at scale.
    :link: milvus.html
    :image: ../_images/brain-object-similarity-modal.gif
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: LanceDB
    :description: Use our LanceDB integration to index your datasets and perform embeddings queries at scale without the need for a cloud service.
    :link: lancedb.html
    :image: ../_images/brain-leaky-splits.png
    :tags: Brain,Embeddings,Vector-Search

.. customcarditem::
    :header: Hugging Face
    :description: Use our Hugging Face Transformers integration to run inference on your FiftyOne datasets with just a few lines of code.
    :link: huggingface.html
    :image: ../_images/hf_data_card_preview.jpg
    :tags: Model-Training,Model-Evaluation,Models,Brain,Embeddings

.. customcarditem::
    :header: Ultralytics
    :description: Load, fine-tune, and run inference with Ultralytics models on your FiftyOne datasets with just a few lines of code.
    :link: ultralytics.html
    :image: ../_images/yolov8_coco_val_predictions.png
    :tags: Model-Training,Model-Evaluation,Models

.. customcarditem::
    :header: Albumentations
    :description: Use our Albumentations integration to test out data augmentation transformations in real-time on your FiftyOne datasets.
    :link: albumentations.html
    :image: ../_images/augmentations_initial_dataset.png
    :tags: Datasets,Model-Training

.. customcarditem::
    :header: SuperGradients
    :description: Use our SuperGradients integration to run inference with YOLO-NAS models on your FiftyOne datasets with just a few lines of code.
    :link: super_gradients.html
    :image: ../_images/yolov8_finetune_predictions_app.png
    :tags: Model-Training,Model-Evaluation,Models

.. customcarditem::
    :header: OpenCLIP
    :description: Use our OpenCLIP integration to run inference with CLIP models on your FiftyOne datasets with just a few lines of code.
    :link: openclip.html
    :image: ../_images/clip-compare.gif
    :tags: Brain,Embeddings,Model-Evaluation,Models

.. customcarditem::
    :header: PyTorch Hub
    :description: Did you know? You can load any model from the PyTorch Hub and run inference on your FiftyOne datasets with just a few lines of code.
    :link: pytorch_hub.html
    :image: ../_images/detection-evaluation.gif
    :tags: Model-Training,Model-Evaluation,Models

.. customcarditem::
    :header: Lightning Flash
    :description: Train Flash models on FiftyOne datasets and use the FiftyOne App to visualize and improve your Flash models, all with just a few lines of code.
    :link: lightning_flash.html
    :image: ../_images/brain-image-visualization.gif
    :tags: Model-Training,Model-Evaluation,Models

.. customcarditem::
    :header: Rerun
    :description: Visualize Rerun data files inside the FiftyOne App.
    :link: rerun.html
    :image: ../_static/images/integrations/rerun.jpeg
    :tags: Visualization

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
    Integrating with Annotation Backends <annotation.rst>
    CVAT <cvat.rst>
    Label Studio <labelstudio.rst>
    V7 <v7.rst>
    Labelbox <labelbox.rst>
    Qdrant <qdrant.rst>
    Redis <redis.rst>
    Pinecone <pinecone.rst>
    MongoDB <mongodb.rst>
    Elasticsearch <elasticsearch.rst>
    PostgreSQL Pgvector <pgvector.rst>
    Databricks Mosaic AI <mosaic.rst>
    Milvus <milvus.rst>
    LanceDB <lancedb.rst>
    Hugging Face <huggingface.rst>
    Ultralytics <ultralytics.rst>
    Albumentations <albumentations.rst>
    SuperGradients <super_gradients.rst>
    OpenCLIP <openclip.rst>
    PyTorch Hub <pytorch_hub.rst>
    Lightning Flash <lightning_flash.rst>
    Rerun <rerun.rst>
