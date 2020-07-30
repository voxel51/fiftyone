FiftyOne
========

*"Rapidly experiment with your datasets"*

If you are looking to boost the performance of your machine learning models,
chances are improving the quality of your dataset will provide the highest
return on your investment. **Enter FiftyOne.** FiftyOne is a Python-based tool
for the visual data scientist that enables you to create valuable and diverse
datasets. Work efficiently with FiftyOne to achieve better models with
dependable performance.

*"Become one with your data"*

FiftyOne does more than improve your dataset; it gets you closer to your data.
Rapidly gain insight by visualizing samples overlayed with with dynamic and
queryable fields such as ground truth and predicted labels, dataset splits, and
much more!

.. image:: images/video_placeholder.png
   :alt: Overview
   :align: center

Core Capabilities
_________________

FiftyOne provides advanced capabilities that will turbocharge your machine
learning workflows.

**Finding annotation mistakes**

Annotations mistakes create an artificial ceiling on the performance of your
models. However, finding these mistakes by hand is at least as arduous as the
original annotation work! FiftyOne provides a `mistakenness` tool that can
automatically identify possible label mistakes in your datasets.

:doc:`>> Try it now! <tutorials/label_mistakes>`

**Removing redundant images**

During the training loop for a model, the best results will be seen when
training on unique data. For example, finding and removing similar samples in
your dataset can avoid accidental concept imbalance that can bias the learning
of your model. FiftyOne provides a `uniqueness` tool that can automatically
identify duplicate or near-duplicate images in your datasets.

:doc:`>> Try it now! <tutorials/uniqueness>`

**Bootstrapping training datasets from raw images**

In the early stages of a machine learning workflow, ML engineers inevitably ask
themselves: *what data should I select to annotate?* This is a critical
question, as acquiring high quality ground truth annotations is an expensive
and time consuming process. FiftyOne provides methods that can automatically
recommend unlabeled samples from your dataset to send for annotation, enabling
you to bootsrap a training dataset that leads to demonstrably better model
performance.

.. note::

    Tutorial coming soon!

**Adding optimal samples to your dataset**

While training, ML models understand attributes of certain samples faster than
others. The natural question arises: *what new samples should I add to my
training dataset to provide the largest incremental improvement to the
performance of my model?* FiftyOne provides methods for mining hard samples
from your datasets, a tried and true measure of mature machine
learning processes.

.. note::

    Tutorial coming soon!

Core Concepts
_____________

:doc:`The FiftyOne Core Library <user_guide/basics>`

FiftyOne's core library provides a structured yet dynamic representation to
explore your datasets. You can efficiently query and manipulate your dataset by
adding custom tags, model predictions and more.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset("my_dataset")

    sample = fo.Sample(filepath="path/to/img.png")
    sample.tags.append("train")
    sample["custom_field"] = 51

    dataset.add_sample(sample)

    view = dataset.match_tag("train").sort_by("custom_field").limit(10)

    for sample in view:
        print(sample)

.. note::

    FiftyOne is designed to be lightweight and flexible, making it easy to load
    your datasets. FiftyOne supports loading datasets in a variety of common
    formats out-of-the-box, and it also provides the extensibility to load
    datasets in custom formats.

    Check out :doc:`loading datasets <user_guide/dataset_creation/index>` to see
    how to load your data into FiftyOne!

:doc:`The FiftyOne App <user_guide/app>`

The FiftyOne App is a graphical user interface (GUI) that makes it easy to
rapidly gain intuition into your datasets. You can visualize labels, bounding
boxes and segmentations overlayed on the samples; sort, query and slice your
dataset into any aspect you need; and more.

.. image:: images/dog.png
   :alt: App
   :align: center

:doc:`The FiftyOne Brain <user_guide/brain>`

The FiftyOne Brain is a library of powerful machine learning-powered
:ref:`capabilities <Core Capabilities>` that provide insights into your
datasets and recommend ways to modify your datasets that will lead to
measurably better performance of your models.

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
* Consult the :doc:`user guide <user_guide/index>` for detailed instructions on
  how to accomplish various tasks with FiftyOne

Need Support?
_____________

If you run into any issues with FiftyOne or have any burning questions, feel
free to
`connect with us on Slack <https://voxel51.slack.com/app_redirect?channel=C0154574MKJ>`_
or reach out to us at support@voxel51.com.

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   Installation <getting_started/install>
   Tutorials <tutorials/index>
   Recipes <recipes/index>
   User Guide <user_guide/index>
   Release Notes <release-notes>
   CLI Documentation <cli/index>
   API Reference <api/index>
