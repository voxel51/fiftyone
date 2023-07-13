FiftyOne
========

.. Social links ---------------------------------------------------------------

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
        <a target="_blank" href="https://slack.voxel51.com">
          <img alt="Slack community" src="_static/images/icons/slack-logo-256px.png">
          &nbsp Join us on Slack
        </a>
      </th>
      <th>
        <a target="_blank" href="https://colab.research.google.com/github/voxel51/fiftyone-examples/blob/master/examples/quickstart.ipynb">
          <img alt="Colab quickstart" src="_static/images/icons/colab-logo-256px.png">
          &nbsp Try it in Colab
        </a>
      </th>
    </table>
  </div>

.. End social links -----------------------------------------------------------

**The open-source tool for building high-quality datasets and computer vision models**

Nothing hinders the success of machine learning systems more than poor quality
data. And without the right tools, improving a model can be time-consuming and
inefficient.

FiftyOne supercharges your machine learning workflows by enabling you to
visualize datasets and interpret models faster and more effectively.

.. raw:: html

  <div style="margin-top: 20px; margin-bottom: 20px">
    <video controls muted poster="https://voxel51.com/images/fiftyone-poster-v2.png" style="width: 100%;">
      <source src="https://voxel51.com/images/fiftyone_long_sizzle_light_bg.mp4" type="video/mp4">
    </video>
  </div>

Improving data quality and understanding your model's failure modes are the
most impactful ways to boost the performance of your model.

FiftyOne provides the building blocks for optimizing your dataset analysis
pipeline. Use it to get hands-on with your data, including visualizing complex
labels, evaluating your models, exploring scenarios of interest, identifying
failure modes, finding annotation mistakes, and much more!

.. custombutton::
    :button_text: Install FiftyOne!
    :button_link: getting_started/install.html

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
    :image_link: integrations/pinecone.html
    :image_src: https://voxel51.com/images/integrations/pinecone-128.png
    :image_title: Pinecone

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
    :image_link: integrations/labelbox.html
    :image_src: https://voxel51.com/images/integrations/labelbox-128.png
    :image_title: Labelbox

.. customimagelink::
    :image_link: api/fiftyone.utils.scale.html
    :image_src: https://voxel51.com/images/integrations/scale-128.png
    :image_title: Scale AI

.. customimagelink::
    :image_link: teams/installation.html#google-cloud-storage
    :image_src: https://voxel51.com/images/integrations/google-cloud-128.png
    :image_title: Google Cloud

.. customimagelink::
    :image_link: teams/installation.html#amazon-s3
    :image_src: https://voxel51.com/images/integrations/aws-128.png
    :image_title: Amazon Web Services

.. customimagelink::
    :image_link: teams/installation.html#microsoft-azure
    :image_src: https://voxel51.com/images/integrations/azure-128.png
    :image_title: Azure

.. raw:: html

    </div>

.. note::

  FiftyOne is growing!
  `Sign up for the mailing list <https://share.hsforms.com/1zpJ60ggaQtOoVeBqIZdaaA2ykyk>`_
  to learn about new features as they come out.

.. _core-capabilities:

Core Capabilities
_________________

.. Callout items --------------------------------------------------------------

.. raw:: html

    <div class="tutorials-callout-container">
        <div class="row">

.. Add callout items below this line

.. customcalloutitem::
    :header: Curating datasets
    :description: Surveys show that machine learning engineers spend over half of their time wrangling data, but it doesn't have to be that way. Use FiftyOne's powerful dataset import and manipulation capabilities to manage your data with ease.
    :button_text: Learn how to load data into FiftyOne
    :button_link: user_guide/dataset_creation/index.html
    :image: _static/images/homepage_curate.gif

.. customcalloutitem::
    :header: Evaluating models
    :description: Aggregate metrics alone don’t give you the full picture of your ML models. In practice, the limiting factor on your model’s performance is often data quality issues that you need to see to address. FiftyOne makes it easy to do just that.
    :button_text: See how to evaluate models with FiftyOne
    :button_link: tutorials/evaluate_detections.html
    :image: _static/images/homepage_evaluate.gif

.. customcalloutitem::
    :header: Visualizing embeddings
    :description: Are you using embeddings to analyze your data and models? Use FiftyOne's embeddings visualization capabilities to reveal hidden structure in you data, mine hard samples, pre-annotate data, recommend new samples for annotation, and more.
    :button_text: Experience the power of embeddings
    :button_link: tutorials/image_embeddings.html
    :image: _static/images/homepage_embeddings.gif

.. customcalloutitem::
    :header: Working with geolocation
    :description: Many datasets have location metadata, but visualizing location-based datasets has traditionally required closed source or cloud-based tools. FiftyOne provides native support for storing, visualizing, and querying datasets by location.
    :button_text: Visualize your location data
    :button_link: user_guide/plots.html#geolocation-plots
    :image: _static/images/homepage_location.gif

.. customcalloutitem::
    :header: Finding annotation mistakes
    :description: Annotations mistakes create an artificial ceiling on the performance of your model. However, finding these mistakes by hand is not feasible! Use FiftyOne to automatically identify possible label mistakes in your datasets.
    :button_text: Check out the label mistakes tutorial
    :button_link: tutorials/classification_mistakes.html
    :image: _static/images/homepage_mistakes.gif

.. customcalloutitem::
    :header: Removing redundant images
    :description: During model training, the best results will be seen when training on unique data. Use FiftyOne to automatically remove duplicate or near-duplicate images from your datasets and curate diverse training datasets from your raw data.
    :button_text: Try the image uniqueness tutorial
    :button_link: tutorials/uniqueness.html
    :image: _static/images/homepage_redundant.gif

.. End callouts ---------------------------------------------------------------

.. raw:: html

        </div>
    </div>

.. End of callout items -------------------------------------------------------

Core Concepts
_____________

The FiftyOne tool has three components: the Python library, the App, and the
Brain.

.. _fiftyone-library:

:doc:`FiftyOne Library <user_guide/basics>`
-------------------------------------------

FiftyOne's core library provides a structured yet dynamic representation to
explore your datasets. You can efficiently query and manipulate your dataset by
adding custom tags, model predictions and more.

.. custombutton::
    :button_text: Explore the library
    :button_link: user_guide/basics.html

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset("my_dataset")

    sample = fo.Sample(filepath="/path/to/image.png")
    sample.tags.append("train")
    sample["custom_field"] = 51

    dataset.add_sample(sample)

    view = dataset.match_tags("train").sort_by("custom_field").limit(10)

    for sample in view:
        print(sample)

.. note::

    FiftyOne is designed to be lightweight and flexible, making it easy to load
    your datasets. FiftyOne supports loading datasets in a variety of common
    formats out-of-the-box, and it also provides the extensibility to load
    datasets in custom formats.

    Check out :doc:`loading datasets <user_guide/dataset_creation/index>` to see
    how to load your data into FiftyOne.

:doc:`FiftyOne App <user_guide/app>`
------------------------------------

The FiftyOne App is a graphical user interface that makes it easy to explore
and rapidly gain intuition into your datasets. You can visualize labels like
bounding boxes and segmentations overlaid on the samples; sort, query and
slice your dataset into any subset of interest; and more.

.. custombutton::
    :button_text: See more of the App
    :button_link: user_guide/app.html

.. image:: images/homepage_app.png
   :alt: fiftyone-app
   :align: center

:doc:`FiftyOne Brain <user_guide/brain>`
----------------------------------------

The FiftyOne Brain is a library of powerful machine learning-powered
capabilities that provide insights into your datasets and recommend ways to
modify your datasets that will lead to measurably better performance of your
models.

.. custombutton::
    :button_text: Learn more about the Brain
    :button_link: user_guide/brain.html

.. code-block:: python
   :linenos:

   import fiftyone.brain as fob

   fob.compute_uniqueness(dataset)
   rank_view = dataset.sort_by("uniqueness")

What's Next?
____________

Where should you go from here? You could...

* :ref:`Install FiftyOne <installing-fiftyone>`
* Try one of the :doc:`tutorials <tutorials/index>` that demonstrate the unique
  capabilities of FiftyOne
* Explore :doc:`recipes <recipes/index>` for integrating FiftyOne into
  your current ML workflows
* Check out the :doc:`cheat sheets <cheat_sheets/index>` for topics you may
  want to master quickly
* Consult the :doc:`user guide <user_guide/index>` for detailed instructions on
  how to accomplish various tasks with FiftyOne

Need Support?
_____________

If you run into any issues with FiftyOne or have any burning questions, feel
free to `connect with us on Slack <https://slack.voxel51.com>`_ or reach out to
us at support@voxel51.com.

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   Installation <getting_started/install>
   Environments <environments/index>
   Tutorials <tutorials/index>
   Recipes <recipes/index>
   Cheat Sheets <cheat_sheets/index>
   User Guide <user_guide/index>
   FiftyOne Teams <teams/index>
   Integrations <integrations/index>
   Plugins <plugins/index>
   CLI <cli/index>
   API Reference <api/fiftyone>
   Release Notes <release-notes>
   FAQ <faq/index>
