:orphan:

FiftyOne
========

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


.. Section A: Hero with Search ------------------------------------------------

.. raw:: html

  <div class="landing-hero">
    <h1 class="hero-heading">Hi, how can we help?</h1>
    <p class="hero-subheading">Search the docs, or ask AI anything about FiftyOne</p>
    <div class="hero-search-container">
      <button class="hero-search-btn DocSearch DocSearch-Button" aria-label="Search docs">
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M14.386 14.386l4.088 4.088-4.088-4.088A7.533 7.533 0 1 1 3.733 3.733a7.533 7.533 0 0 1 10.653 10.653z" stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        <span class="hero-search-placeholder">Search documentation...</span>
        <span class="search-shortcut-badge"></span>
      </button>
      <button class="hero-ask-ai-btn" onclick="if(window.Kapa){window.Kapa.open();}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
        Ask AI
      </button>
    </div>
    <div class="quick-action-pills">
      <a href="installation/index.html" class="quick-action-pill">Install FiftyOne</a>
      <a href="user_guide/import_datasets.html" class="quick-action-pill">Import my data</a>
      <a href="#" class="quick-action-pill" onclick="event.preventDefault();if(window.Kapa){window.Kapa.open({mode:'ai',query:'How do I evaluate my model in FiftyOne?',submit:true});}">Evaluate my model</a>
      <a href="plugins/index.html" class="quick-action-pill">Browse plugins</a>
      <a href="user_guide/app.html" class="quick-action-pill">Explore the App</a>
      <a href="dataset_zoo/index.html" class="quick-action-pill">Load a zoo dataset</a>
    </div>
  </div>

.. Section B: Use-Case Cards --------------------------------------------------

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

.. Section C: Popular Topics Grid ---------------------------------------------

Popular Topics
______________

.. raw:: html

    <div class="topics-section">
        <div class="topics-grid">
            <a href="installation/index.html" class="topic-card">
                <h4>Getting Started</h4>
                <p>Install FiftyOne and start exploring your data</p>
            </a>
            <a href="user_guide/app.html" class="topic-card">
                <h4>FiftyOne App</h4>
                <p>Visualize, explore, and interact with your datasets</p>
            </a>
            <a href="brain.html" class="topic-card">
                <h4>FiftyOne Brain</h4>
                <p>ML-powered insights for smarter data workflows</p>
            </a>
            <a href="plugins/index.html" class="topic-card">
                <h4>Plugins</h4>
                <p>Extend FiftyOne with custom panels and operators</p>
            </a>
            <a href="dataset_zoo/index.html" class="topic-card">
                <h4>Dataset Zoo</h4>
                <p>Load popular benchmark datasets with one command</p>
            </a>
            <a href="model_zoo/index.html" class="topic-card">
                <h4>Model Zoo</h4>
                <p>Access hundreds of pre-trained models instantly</p>
            </a>
            <a href="tutorials/index.html" class="topic-card">
                <h4>Tutorials</h4>
                <p>Step-by-step guides for common workflows</p>
            </a>
            <a href="api/fiftyone.html" class="topic-card">
                <h4>API Reference</h4>
                <p>Complete Python API documentation</p>
            </a>
        </div>
    </div>

.. Section D: Core Capabilities (condensed to 4) ------------------------------

Core Capabilities
_________________

.. raw:: html

    <div class="tutorials-callout-container">
        <div class="row">

.. customcalloutitem::
    :header: Curating datasets
    :description: Use FiftyOne's powerful dataset import and manipulation capabilities to manage your data with ease. Spend less time wrangling data and more time building models.
    :button_text: Learn how to import data into FiftyOne
    :button_link: user_guide/import_datasets.html
    :image: _static/images/homepage_curate.gif

.. customcalloutitem::
    :header: Evaluating models
    :description: Aggregate metrics alone don't give you the full picture. FiftyOne makes it easy to see where your models succeed and fail so you can iterate faster.
    :button_text: See how to evaluate models with FiftyOne
    :button_link: tutorials/evaluate_detections.html
    :image: _static/images/homepage_evaluate.gif

.. customcalloutitem::
    :header: Visualizing embeddings
    :description: Reveal hidden structure in your data, mine hard samples, pre-annotate data, recommend new samples for annotation, and more with embedding visualizations.
    :button_text: Experience the power of embeddings
    :button_link: tutorials/image_embeddings.html
    :image: _static/images/homepage_embeddings.gif

.. customcalloutitem::
    :header: Finding annotation mistakes
    :description: Annotation mistakes create an artificial ceiling on model performance. Use FiftyOne to automatically identify possible label mistakes in your datasets.
    :button_text: Check out the label mistakes tutorial
    :button_link: tutorials/classification_mistakes.html
    :image: _static/images/homepage_mistakes.gif

.. raw:: html

        </div>
    </div>

.. Section E: Integrations (top ~15 logos) ------------------------------------

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
    :image_link: integrations/huggingface.html
    :image_src: https://voxel51.com/images/integrations/hugging-face-128.png
    :image_title: Hugging Face

.. customimagelink::
    :image_link: integrations/ultralytics.html
    :image_src: https://voxel51.com/images/integrations/ultralytics-128.png
    :image_title: Ultralytics

.. customimagelink::
    :image_link: recipes/adding_detections.html
    :image_src: https://voxel51.com/images/integrations/tensorflow-128.png
    :image_title: TensorFlow

.. customimagelink::
    :image_link: integrations/lightning_flash.html
    :image_src: https://voxel51.com/images/integrations/pytorch-lightning-128.png
    :image_title: PyTorch Lightning

.. customimagelink::
    :image_link: integrations/qdrant.html
    :image_src: https://voxel51.com/images/integrations/qdrant-128.png
    :image_title: Qdrant

.. customimagelink::
    :image_link: integrations/pinecone.html
    :image_src: https://voxel51.com/images/integrations/pinecone-128.png
    :image_title: Pinecone

.. customimagelink::
    :image_link: integrations/mongodb.html
    :image_src: https://voxel51.com/images/integrations/mongodb-128.png
    :image_title: MongoDB

.. customimagelink::
    :image_link: integrations/labelbox.html
    :image_src: https://voxel51.com/images/integrations/labelbox-128.png
    :image_title: Labelbox

.. customimagelink::
    :image_link: integrations/cvat.html
    :image_src: https://voxel51.com/images/integrations/cvat-128.png
    :image_title: CVAT

.. customimagelink::
    :image_link: integrations/labelstudio.html
    :image_src: https://voxel51.com/images/integrations/labelstudio-128.png
    :image_title: Label Studio

.. customimagelink::
    :image_link: environments/index.html#notebooks
    :image_src: https://voxel51.com/images/integrations/colab-128.png
    :image_title: Google Colab

.. customimagelink::
    :image_link: enterprise/installation.html#amazon-s3
    :image_src: https://voxel51.com/images/integrations/aws-128.png
    :image_title: Amazon Web Services

.. customimagelink::
    :image_link: enterprise/installation.html#google-cloud-storage
    :image_src: https://voxel51.com/images/integrations/google-cloud-128.png
    :image_title: Google Cloud

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

.. Section F: Social + Support Bar --------------------------------------------

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

.. Toctree (unchanged) --------------------------------------------------------

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   FiftyOne Enterprise 🚀 <enterprise/index>
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
