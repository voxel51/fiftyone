FiftyOne
========

**Visualize datasets, interpret models, improve ML**

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
        <a target="_blank" href="https://join.slack.com/t/fiftyone-users/shared_invite/zt-gtpmm76o-9AjvzNPBOzevBySKzt02gg">
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

FiftyOne will revamp your machine learning workflows by enabling you to
visualize datasets and interpret models faster, easier, and more efficiently 
than ever before. This open-source tool provides the building blocks for an optimized 
data pipeline that lets you get hands-on with your data.

.. raw:: html

   <video controls muted poster="https://voxel51.com/images/fiftyone_long_sizzle_poster.png" style="width: 100%;">
     <source src="https://voxel51.com/images/fiftyone_long_sizzle.mp4" type="video/mp4">
   </video>

.. code-block:: shell

    pip install fiftyone

Improving the quality of your data and understanding how your model behaves 
are the most surefire ways to boost the performance of your machine learning models. 

Using FiftyOne, you can quickly visualize complex labels, find duplicate images, 
flag annotation mistakes, interactively
explore embeddings, query your dataset fields, and much more!

**"Like pandas for visual datasets"**

FiftyOne is unlike other tools in the existing ML ecosystem. It is designed to
be a lightweight hub for interactions with your data and labels, providing
tight integrations with your favorite tools.


.. image:: images/homepage_integrations.png
    :alt: Integrations
    :align: center

.. note::

  FiftyOne is rapidly growing.
  `Sign up for the mailing list <https://share.hsforms.com/1zpJ60ggaQtOoVeBqIZdaaA2ykyk>`_
  so we can keep you posted on new features as they come out!

.. _core-capabilities:

Core Capabilities
_________________

FiftyOne provides advanced capabilities that will turbocharge your machine
learning workflows.


.. Callout items --------------------------------------------------------------

.. raw:: html

    <div class="tutorials-callout-container">
        <div class="row">

.. Add callout items below this line

.. customcalloutitem::
    :header: Curating datasets
    :description: FiftyOne's flexible datasets and API let ML engineers spend less time wrangling data and more time training better models.    
    :button_text: Learn how to load data into FiftyOne
    :button_link: user_guide/dataset_creation/index.html
    :image: _static/images/homepage_curate.gif

.. customcalloutitem::
    :header: Visualizing interactive embeddings 
    :description: Unsupervised annotation, hard sample mining, finding incorrect predictions, and more is easy with embeddings visualizations in FiftyOne.
    :button_text: Try out interactive embeddings yourself 
    :button_link: tutorials/embeddings.html
    :image: _static/images/homepage_embeddings.gif

.. customcalloutitem::
    :header: Evaluating models
    :description: Aggregate metrics are not enough, FiftyOne provides hands-on evaluation of your model output to enable you to train better models.
    :button_text: See how to evaluate models with FiftyOne
    :button_link: tutorials/evaluate_detections.html
    :image: _static/images/homepage_evaluate.gif

.. customcalloutitem::
    :header: Finding annotation mistakes
    :description: Annotation mistakes creep into any large dataset, but FiftyOne makes it easy to automatically identify, tag, and fix label mistakes.
    :button_text: Check out the label mistakes tutorial
    :button_link: tutorials/classification_mistakes.html
    :image: _static/images/homepage_mistakes.gif

.. customcalloutitem::
    :header: Removing redundant images
    :description: FiftyOne helps find near-duplicate images and curate diverse datasets to improve model performance and reduce annotation costs.
    :button_text: Try the image uniqueness tutorial
    :button_link: tutorials/uniqueness.html
    :image: _static/images/homepage_redundant.gif

.. customcalloutitem::
    :header: Visualizing geolocation data
    :description: The plotting functionalities in FiftyOne are flexible enough to make even difficult annotations, like geolocation data, easy to explore.
    :button_text: Tutorial coming soon! 
    :button_link:
    :image: _images/location-scatterplot.gif

.. End callouts ---------------------------------------------------------------

.. raw:: html

        </div>
    </div>

.. End of callout items -------------------------------------------------------

Core Concepts
_____________

The FiftyOne tool has three components: the core library, the App, and the
Brain.

:doc:`FiftyOne Core Library <user_guide/basics>`
------------------------------------------------

FiftyOne's core library provides a structured yet dynamic representation to
explore your datasets. You can efficiently query and manipulate your dataset by
adding custom tags, model predictions and more.

.. custombutton::
    :button_text: Explore the Core Library
    :button_link: user_guide/basics.html

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset(name="my_dataset")

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
    how to load your data into FiftyOne!

:doc:`FiftyOne App <user_guide/app>`
------------------------------------

The FiftyOne App is a graphical user interface (GUI) that makes it easy to
rapidly gain intuition into your datasets. You can visualize labels, bounding
boxes and segmentations overlayed on the samples; sort, query and slice your
dataset into any aspect you need; and more.

.. custombutton::
    :button_text: See more of the App
    :button_link: user_guide/app.html

.. image:: images/homepage2.png
   :alt: App
   :align: center

:doc:`FiftyOne Brain <user_guide/brain>`
----------------------------------------

The FiftyOne Brain is a library of powerful machine learning-powered
:ref:`capabilities <core-capabilities>` that provide insights into your
datasets and recommend ways to modify your datasets that will lead to
measurably better performance of your models.

.. custombutton::
    :button_text: Learn more about the Brain
    :button_link: user_guide/brain.html

.. code-block:: python
   :linenos:

   import fiftyone.brain as fob

   fob.compute_uniqueness(dataset)
   rank_view = dataset.sort_by("uniqueness")

.. note::

    The FiftyOne Brain is a separate Python package that is bundled with
    FiftyOne. Although it is closed-source, it is licensed as freeware, and you
    have permission to use it for commercial or non-commercial purposes. See
    `the license <https://github.com/voxel51/fiftyone/blob/develop/package/brain/LICENSE>`_
    for more details.

What's Next?
____________

Where should you go from here? You could...

* :ref:`Install FiftyOne <installing-fiftyone>`
* Try one of the :doc:`tutorials <tutorials/index>` that demonstrate the unique
  capabilities of FiftyOne
* Explore :doc:`recipes <recipes/index>` for integrating FiftyOne into
  your current ML workflows
* Consult the :doc:`user guide <user_guide/index>` for detailed instructions on
  how to accomplish various tasks with FiftyOne

Need Support?
_____________

If you run into any issues with FiftyOne or have any burning questions, feel
free to
`connect with us on Slack <https://join.slack.com/t/fiftyone-users/shared_invite/zt-gtpmm76o-9AjvzNPBOzevBySKzt02gg>`_
or reach out to us at support@voxel51.com.

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   Installation <getting_started/install>
   Environments <environments/index>
   Tutorials <tutorials/index>
   Recipes <recipes/index>
   User Guide <user_guide/index>
   Release Notes <release-notes>
   CLI Documentation <cli/index>
   API Reference <api/fiftyone>
   FAQ <faq/index>
