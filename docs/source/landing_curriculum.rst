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


.. Section A: 60-Second Quickstart Dark Hero ----------------------------------

.. raw:: html

  <div class="curriculum-hero-dark">
    <h1 class="curriculum-hero-heading">See FiftyOne in 60 Seconds</h1>
    <div class="curriculum-code-steps">
      <div class="code-step">
        <span class="step-number">1</span>
        <code>pip install fiftyone</code>
      </div>
      <div class="code-step">
        <span class="step-number">2</span>
        <code>import fiftyone as fo<br>dataset = fo.zoo.load_zoo_dataset("quickstart")</code>
      </div>
      <div class="code-step">
        <span class="step-number">3</span>
        <code>session = fo.launch_app(dataset)</code>
      </div>
    </div>
    <div class="curriculum-hero-cta">
      <a href="getting_started/index.html" class="curriculum-cta-primary">Follow the full quickstart →</a>
      <a href="installation/index.html" class="curriculum-cta-secondary">Install locally</a>
    </div>
  </div>

.. Section B: Choose Your Path ------------------------------------------------

Choose Your Path
________________

.. raw:: html

  <div class="curriculum-paths-section">
    <div class="curriculum-tracks">
      <div class="track-card">
        <div class="track-header">
          <h3>New to Computer Vision</h3>
          <span class="track-time">~2–4 hrs</span>
        </div>
        <p>Build foundational skills from detection to embeddings.</p>
        <ol class="track-steps">
          <li><a href="getting_started/object_detection/index.html">Object Detection Guide</a></li>
          <li><a href="getting_started/model_evaluation/index.html">Model Evaluation Guide</a></li>
          <li><a href="tutorials/image_embeddings.html">Embeddings Tutorial</a></li>
        </ol>
      </div>
      <div class="track-card">
        <div class="track-header">
          <h3>I Have Data to Explore</h3>
          <span class="track-time">~1–2 hrs</span>
        </div>
        <p>Import, understand, and curate your datasets fast.</p>
        <ol class="track-steps">
          <li><a href="user_guide/import_datasets.html">Import Datasets</a></li>
          <li><a href="brain.html">FiftyOne Brain</a></li>
          <li><a href="user_guide/annotation.html">Annotation Tools</a></li>
        </ol>
      </div>
      <div class="track-card">
        <div class="track-header">
          <h3>Production Integration</h3>
          <span class="track-time">~1–2 hrs</span>
        </div>
        <p>Connect FiftyOne to your ML infrastructure.</p>
        <ol class="track-steps">
          <li><a href="integrations/index.html">Integrations Overview</a></li>
          <li><a href="plugins/index.html">Plugins Framework</a></li>
          <li><a href="enterprise/index.html">Enterprise Features</a></li>
        </ol>
      </div>
    </div>
  </div>

.. Section C: Core Toolkit Accordion ------------------------------------------

Core Toolkit
____________

.. raw:: html

  <div class="curriculum-toolkit-section">
  </div>

.. dropdown:: Visualize — Explore your data in the FiftyOne App
    :open:

    The FiftyOne App lets you visualize, explore, and interact with your
    datasets. Browse samples, filter by labels, and gain intuition about
    your data at a glance.

    .. image:: _static/images/homepage_curate.gif
       :alt: FiftyOne App visualization
       :align: center

    .. customanimatedcta::
        :button_text: Explore the App
        :button_link: user_guide/app.html

.. dropdown:: Evaluate — Understand where your models succeed and fail

    Go beyond aggregate metrics. FiftyOne makes it easy to see per-sample
    model performance, compare predictions, and identify failure modes.

    .. image:: _static/images/homepage_evaluate.gif
       :alt: Model evaluation in FiftyOne
       :align: center

    .. customanimatedcta::
        :button_text: Evaluate models
        :button_link: tutorials/evaluate_detections.html

.. dropdown:: Curate — Find the right data for your model

    Use embeddings to reveal hidden structure, mine hard samples,
    find near-duplicates, and recommend new samples for annotation.

    .. image:: _static/images/homepage_embeddings.gif
       :alt: Embedding visualization
       :align: center

    .. customanimatedcta::
        :button_text: Explore embeddings
        :button_link: tutorials/image_embeddings.html

.. dropdown:: Annotate — Label and correct data in-app

    Fix label mistakes and annotate datasets from scratch directly in
    the FiftyOne App. Works with 2D and 3D data.

    .. image:: _static/images/annotate.gif
       :alt: Annotation in FiftyOne
       :align: center

    .. customanimatedcta::
        :button_text: Start annotating
        :button_link: user_guide/annotation.html

.. dropdown:: Integrate — Connect your favorite tools

    FiftyOne integrates with PyTorch, TensorFlow, Hugging Face,
    Ultralytics, vector databases, annotation platforms, and more.

    .. raw:: html

        <div class="integrations-logos" style="margin-top: 16px;">

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

    .. raw:: html

        </div>

    .. customanimatedcta::
        :button_text: View all 30+ integrations
        :button_link: integrations/index.html

.. Section D: Use-Case Carousel -----------------------------------------------

Industry Use Cases
__________________

.. raw:: html

  <div class="carousel-section">
    <div class="horizontal-carousel">
      <a href="getting_started/medical_imaging/index.html" class="carousel-card">
        <img src="https://cdn.voxel51.com/all_patients_ct.webp" alt="Medical Imaging" loading="lazy" />
        <div class="carousel-card-body">
          <h4>Medical Imaging</h4>
          <p>DICOM, CT scans, volumetric data</p>
        </div>
      </a>
      <a href="getting_started/self_driving/index.html" class="carousel-card">
        <img src="https://cdn.voxel51.com/getting_started_self_driving/notebook1/enuscenes.webp" alt="Autonomous Vehicles" loading="lazy" />
        <div class="carousel-card-body">
          <h4>Autonomous Vehicles</h4>
          <p>Sensor fusion, trajectories</p>
        </div>
      </a>
      <a href="getting_started/object_detection/index.html" class="carousel-card">
        <img src="https://cdn.voxel51.com/dice_dataset.webp" alt="Object Detection" loading="lazy" />
        <div class="carousel-card-body">
          <h4>Object Detection</h4>
          <p>Bounding boxes, pipelines</p>
        </div>
      </a>
      <a href="getting_started/model_evaluation/index.html" class="carousel-card">
        <img src="https://cdn.voxel51.com/getting_started_model_evaluation/notebook2/model_evaluation.webp" alt="Model Evaluation" loading="lazy" />
        <div class="carousel-card-body">
          <h4>Model Evaluation</h4>
          <p>Advanced analysis workflows</p>
        </div>
      </a>
      <a href="getting_started/manufacturing/index.html" class="carousel-card">
        <img src="https://cdn.voxel51.com/getting_started_manufacturing/notebook1/filtering.webp" alt="Manufacturing" loading="lazy" />
        <div class="carousel-card-body">
          <h4>Manufacturing</h4>
          <p>Defect detection, QA</p>
        </div>
      </a>
      <a href="getting_started/threed_visual_ai/index.html" class="carousel-card">
        <img src="https://docs.voxel51.com/_images/pointe_headphones_fo.gif" alt="3D Vision" loading="lazy" />
        <div class="carousel-card-body">
          <h4>3D Vision</h4>
          <p>Point clouds, meshes</p>
        </div>
      </a>
    </div>
  </div>

.. Section E: Go Deeper -------------------------------------------------------

Go Deeper
_________

.. raw:: html

  <div class="go-deeper-section">
    <div class="go-deeper-grid">
      <a href="api/fiftyone.html" class="go-deeper-link">API Reference</a>
      <a href="cli/index.html" class="go-deeper-link">CLI</a>
      <a href="plugins/index.html" class="go-deeper-link">Plugins</a>
      <a href="release-notes.html" class="go-deeper-link">Release Notes</a>
    </div>
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
