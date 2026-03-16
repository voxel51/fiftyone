:orphan:

.. raw:: html

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "FiftyOne",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Linux, macOS, Windows",
    "description": "The open-source tool for building high-quality datasets and computer vision models",
    "url": "https://docs.voxel51.com",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "softwareHelp": { "@type": "CreativeWork", "url": "https://docs.voxel51.com" }
  }
  </script>

.. raw:: html

  <div class="responsive-banner">
    <a href="https://link.voxel51.com/visual-ai-survey-5" target="_blank" aria-label="Share how you build, deploy, and scale visual AI">
      <video class="banner-mobile" autoplay loop muted playsinline aria-hidden="true">
        <source src="https://cdn.voxel51.com/banner/survey_2026_january_1200x200.webm" type="video/webm">
      </video>
      <video class="banner-desktop" autoplay loop muted playsinline aria-hidden="true">
        <source src="https://cdn.voxel51.com/banner/survey_2026_january_2400x400.webm" type="video/webm">
      </video>
    </a>
  </div>

.. raw:: html

  <div class="social-links">
    <table id="social-links-table">
      <th>
        <a target="_blank" href="https://github.com/voxel51/fiftyone">
          <img alt="GitHub repository" src="_static/images/icons/github-logo-256px.png">
          &nbsp View on GitHub
        </a>
      </th>
      <th>
        <a target="_blank" href="https://community.voxel51.com/">
          <img alt="Discord community" src="_static/images/icons/discord-logo-256px.png">
          &nbsp Join us on Discord
        </a>
      </th>
      <th>
        <a href="enterprise/index.html">
          <img alt="FiftyOne Enterprise" src="_static/images/icons/voxel51-166px.png">
          &nbsp Explore FiftyOne Enterprise
        </a>
      </th>
    </table>
  </div>

.. Section 1: Topic Bubbles ---------------------------------------------------

.. raw:: html

  <div class="landing-hero pills-only">
    <div class="quick-action-pills">
      <a href="installation/index.html" class="quick-action-pill">Install FiftyOne</a>
      <a href="user_guide/import_datasets.html" class="quick-action-pill">Import my data</a>
      <a href="#" class="quick-action-pill" onclick="event.preventDefault();if(window.Kapa){window.Kapa.open({mode:'ai',query:'How do I evaluate my model in FiftyOne?',submit:true});}">Evaluate my model</a>
      <a href="plugins/index.html" class="quick-action-pill">Browse plugins</a>
      <a href="user_guide/app.html" class="quick-action-pill">Explore the App</a>
      <a href="dataset_zoo/index.html" class="quick-action-pill">Load a zoo dataset</a>
    </div>
  </div>

.. Section 2: Use-Case Cards --------------------------------------------------

What are you working on?
________________________

.. raw:: html

    <div class="use-case-section">
        <div class="row use-case-cards-grid">

.. customusecasecard::
    :title: Medical Imaging
    :description: DICOM, CT scans, and volumetric data workflows
    :link: getting_started/medical_imaging/index.html
    :image: https://cdn.voxel51.com/all_patients_ct.webp

.. customusecasecard::
    :title: Autonomous Vehicles
    :description: Sensor fusion and trajectory analysis
    :link: getting_started/self_driving/index.html
    :image: https://cdn.voxel51.com/getting_started_self_driving/notebook1/enuscenes.webp

.. customusecasecard::
    :title: Object Detection
    :description: Bounding boxes, annotations, and detection pipelines
    :link: getting_started/object_detection/index.html
    :image: https://cdn.voxel51.com/dice_dataset.webp

.. customusecasecard::
    :title: Model Evaluation
    :description: Advanced evaluation workflows and analysis
    :link: getting_started/model_evaluation/index.html
    :image: https://cdn.voxel51.com/getting_started_model_evaluation/notebook2/model_evaluation.webp

.. customusecasecard::
    :title: Manufacturing
    :description: Defect detection and quality inspection
    :link: getting_started/manufacturing/index.html
    :image: https://cdn.voxel51.com/getting_started_manufacturing/notebook1/filtering.webp

.. customusecasecard::
    :title: 3D Vision
    :description: Point clouds and 3D visual AI workflows
    :link: getting_started/threed_visual_ai/index.html
    :image: https://docs.voxel51.com/_images/pointe_headphones_fo.gif

.. raw:: html

        </div>

.. customanimatedcta::
    :button_text: Explore all getting started guides
    :button_link: getting_started/index.html

.. raw:: html

    </div>

.. raw:: html

    <div class="onboarding-banner">
        <div class="onboarding-banner-text">
            <strong>New to FiftyOne?</strong> Start with the 5-minute quickstart.
        </div>
        <a href="https://colab.research.google.com/github/voxel51/fiftyone-examples/blob/master/examples/quickstart.ipynb" target="_blank" class="onboarding-banner-cta">Open in Colab &rarr;</a>
        <button class="onboarding-dismiss" aria-label="Dismiss">&times;</button>
    </div>

.. Section 3: Core Capabilities -----------------------------------------------

Core Capabilities
_________________

.. raw:: html

    <div class="tutorials-callout-container">
        <div class="row">

.. customcalloutitem::
    :header: Visualize
    :description: Explore your data in the FiftyOne App. Reveal hidden structure with embedding visualizations, mine hard samples, and discover patterns across your datasets.
    :button_text: Experience the power of embeddings
    :button_link: tutorials/image_embeddings.html
    :image: _static/images/homepage_embeddings.gif

.. customcalloutitem::
    :header: Evaluate
    :description: Aggregate metrics alone don't give you the full picture. FiftyOne makes it easy to see where your models succeed and fail so you can iterate faster.
    :button_text: See how to evaluate models with FiftyOne
    :button_link: tutorials/evaluate_detections.html
    :image: _static/images/homepage_evaluate.gif

.. customcalloutitem::
    :header: Curate
    :description: Use FiftyOne's powerful dataset import and manipulation capabilities to manage your data with ease. Spend less time wrangling data and more time building models.
    :button_text: Learn how to import data into FiftyOne
    :button_link: user_guide/import_datasets.html
    :image: _static/images/homepage_curate.gif

.. customcalloutitem::
    :header: Annotate
    :description: Annotation mistakes create an artificial ceiling on model performance. Use FiftyOne to automatically identify possible label mistakes and correct them in-app.
    :button_text: Check out the label mistakes tutorial
    :button_link: tutorials/classification_mistakes.html
    :image: _static/images/homepage_mistakes.gif

.. raw:: html

        </div>
    </div>

.. Section 4: Integrations (full logo wall) -----------------------------------

Integrations
____________

FiftyOne integrates naturally with your favorite tools. Click on a logo to
learn how:

.. raw:: html

    <div class="integrations-logos">

.. customimagelink::
    :image_link: recipes/adding_detections.html
    :image_src: https://voxel51.com/images/integrations/pytorch-128.png
    :image_title: PyTorch

.. customimagelink::
    :image_link: integrations/lightning_flash.html
    :image_src: https://voxel51.com/images/integrations/pytorch-lightning-128.png
    :image_title: PyTorch Lightning

.. customimagelink::
    :image_link: integrations/huggingface.html
    :image_src: https://voxel51.com/images/integrations/hugging-face-128.png
    :image_title: Hugging Face

.. customimagelink::
    :image_link: integrations/ultralytics.html
    :image_src: https://voxel51.com/images/integrations/ultralytics-128.png
    :image_title: Ultralytics

.. customimagelink::
    :image_link: integrations/super_gradients.html
    :image_src: https://voxel51.com/images/integrations/super-gradients-128.png
    :image_title: SuperGradients

.. customimagelink::
    :image_link: recipes/adding_detections.html
    :image_src: https://voxel51.com/images/integrations/tensorflow-128.png
    :image_title: TensorFlow

.. customimagelink::
    :image_link: tutorials/detectron2.html
    :image_src: https://voxel51.com/images/integrations/detectron2-128.png
    :image_title: Detectron2

.. customimagelink::
    :image_link: integrations/qdrant.html
    :image_src: https://voxel51.com/images/integrations/qdrant-128.png
    :image_title: Qdrant

.. customimagelink::
    :image_link: integrations/redis.html
    :image_src: https://voxel51.com/images/integrations/redis-128.png
    :image_title: Redis

.. customimagelink::
    :image_link: integrations/pinecone.html
    :image_src: https://voxel51.com/images/integrations/pinecone-128.png
    :image_title: Pinecone

.. customimagelink::
    :image_link: integrations/mongodb.html
    :image_src: https://voxel51.com/images/integrations/mongodb-128.png
    :image_title: MongoDB

.. customimagelink::
    :image_link: integrations/elasticsearch.html
    :image_src: https://voxel51.com/images/integrations/elasticsearch-128.png
    :image_title: Elasticsearch

.. customimagelink::
    :image_link: integrations/postgres.html
    :image_src: https://voxel51.com/images/integrations/postgres-128.png
    :image_title: PostgreSQL

.. customimagelink::
    :image_link: integrations/mosaic.html
    :image_src: https://voxel51.com/images/integrations/mosaic-128.png
    :image_title: Mosaic

.. customimagelink::
    :image_link: integrations/milvus.html
    :image_src: https://voxel51.com/images/integrations/milvus-128.png
    :image_title: Milvus

.. customimagelink::
    :image_link: integrations/lancedb.html
    :image_src: https://voxel51.com/images/integrations/lancedb-128.png
    :image_title: LanceDB

.. customimagelink::
    :image_link: integrations/activitynet.html
    :image_src: https://voxel51.com/images/integrations/activitynet-128.png
    :image_title: ActivityNet

.. customimagelink::
    :image_link: integrations/coco.html
    :image_src: https://voxel51.com/images/integrations/coco-128.png
    :image_title: COCO

.. customimagelink::
    :image_link: integrations/open_images.html
    :image_src: https://voxel51.com/images/integrations/open-images-128.png
    :image_title: Open Images

.. customimagelink::
    :image_link: environments/index.html#notebooks
    :image_src: https://voxel51.com/images/integrations/jupyter-128.png
    :image_title: Jupyter

.. customimagelink::
    :image_link: environments/index.html#notebooks
    :image_src: https://voxel51.com/images/integrations/colab-128.png
    :image_title: Google Colab

.. customimagelink::
    :image_link: user_guide/plots.html
    :image_src: https://voxel51.com/images/integrations/plotly-128.png
    :image_title: Plotly

.. customimagelink::
    :image_link: integrations/cvat.html
    :image_src: https://voxel51.com/images/integrations/cvat-128.png
    :image_title: CVAT

.. customimagelink::
    :image_link: integrations/labelstudio.html
    :image_src: https://voxel51.com/images/integrations/labelstudio-128.png
    :image_title: Label Studio

.. customimagelink::
    :image_link: integrations/v7.html
    :image_src: https://voxel51.com/images/integrations/v7-128.png
    :image_title: V7

.. customimagelink::
    :image_link: https://github.com/segments-ai/segments-voxel51-plugin
    :image_src: https://voxel51.com/images/integrations/segments-128.png
    :image_title: Segments

.. customimagelink::
    :image_link: integrations/labelbox.html
    :image_src: https://voxel51.com/images/integrations/labelbox-128.png
    :image_title: Labelbox

.. customimagelink::
    :image_link: api/fiftyone.utils.scale.html
    :image_src: https://voxel51.com/images/integrations/scale-128.png
    :image_title: Scale AI

.. customimagelink::
    :image_link: enterprise/installation.html#google-cloud-storage
    :image_src: https://voxel51.com/images/integrations/google-cloud-128.png
    :image_title: Google Cloud

.. customimagelink::
    :image_link: enterprise/installation.html#amazon-s3
    :image_src: https://voxel51.com/images/integrations/aws-128.png
    :image_title: Amazon Web Services

.. customimagelink::
    :image_link: enterprise/installation.html#microsoft-azure
    :image_src: https://voxel51.com/images/integrations/azure-128.png
    :image_title: Azure

.. raw:: html

    </div>

.. raw:: html

    <div style="margin-top: 10px;">

.. customanimatedcta::
    :button_text: View all integrations
    :button_link: integrations/index.html

.. raw:: html

    </div>

.. Section 5: Social + Support Bar --------------------------------------------

.. raw:: html

  <div class="landing-social-bar">
    <a target="_blank" href="https://github.com/voxel51/fiftyone" class="social-bar-item">
      <img alt="GitHub" src="_static/images/icons/github-logo-256px.png" />
      <span>GitHub</span>
    </a>
    <a target="_blank" href="https://community.voxel51.com/" class="social-bar-item">
      <img alt="Discord" src="_static/images/icons/discord-logo-256px.png" />
      <span>Discord</span>
    </a>
    <a target="_blank" href="https://colab.research.google.com/github/voxel51/fiftyone-examples/blob/master/examples/quickstart.ipynb" class="social-bar-item">
      <img alt="Colab" src="_static/images/icons/colab-logo-256px.png" />
      <span>Try in Colab</span>
    </a>
    <a href="mailto:support@voxel51.com" class="social-bar-item">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
      <span>support@voxel51.com</span>
    </a>
  </div>

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   FiftyOne Enterprise <enterprise/index>
   Installation <installation/index>
   Getting Started <getting_started/index>
   Tutorials <tutorials/index>
   Recipes <recipes/index>
   Cheat Sheets <cheat_sheets/index>
   User Guide <user_guide/index>
   Dataset Zoo <dataset_zoo/index>
   Model Zoo <model_zoo/index>
   FiftyOne Brain <brain>
   Plugins <plugins/index>
   Integrations <integrations/index>
   CLI <cli/index>
   API Reference <api/fiftyone>
   Contribute <contribute/index>
   Release Notes <release-notes>
   Deprecation Notices <deprecation>
   FAQ <faq/index>
