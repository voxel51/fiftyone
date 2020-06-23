FiftyOne
========

    *"Data is king in the artificial intelligence world."*

If you are looking to boost your model performance, chances are improving
dataset quality is going to provide the highest return on investment.
**FiftyOne** is a cutting-edge, Python-based tool for the visual data scientist
to help in creating valuable and diverse datasets. Work efficiently with
FiftyOne to achieve better models with dependable performance.

    *"Become one with the data."*

FiftyOne does more than improve your dataset; it gets you closer to your data.
Rapidly gain insight by visualizing samples overlayed with with dynamic and
queryable fields such as ground truth and predicted labels, dataset splits, and
much more!

.. image:: images/video_placeholder.png
   :alt: Overview Video
   :width: 100%
   :align: center

Capabilities
____________

FiftyOne provides advanced capabilities that will turbocharge your machine
learning workflows.

.. rubric:: Finding annotation mistakes

Automatically detect label annotation mistakes.

See the :doc:`label mistakes tutorial<tutorials/label_mistakes>` to explore
this capability.

.. rubric:: Removing redundant images

Find and remove similar samples in your dataset to reduce redundancy and avoid
accidental class/concept imbalance in your model training loop.

See the :doc:`uniqueness tutorial<tutorials/uniqueness>` to explore this
capability.

.. rubric:: Bootstrapping training datasets from raw images

Bootstrap your training dataset with raw images.

Tutorial coming soon!

.. rubric:: Adding optimal samples to your dataset

Add the optimal samples to your training dataset for improving your model’s
performance.

Tutorial coming soon!

Concepts
________

.. rubric:: The :doc:`FiftyOne Core Library<user_guide/basics>`

The **FiftyOne Core Library** provides a structured yet dynamic representation
to explore your datasets. You can efficiently query and manipulate your dataset
by adding custom tags, model predictions and more.

.. code-block:: python

    import fiftyone as fo

    dataset = fo.Dataset("my_dataset")

    sample = fo.Sample(filepath="path/to/img.png")
    sample.tags.append("train")
    sample["custom_field"] = 51

    dataset.add_sample(sample)

    view = dataset.view().match_tag("train").sort_by("custom_field").limit(10)

    for sample in view:
        print(sample)

.. note::
    FiftyOne is designed to be lightweight and flexible, so it is easy to load
    your datasets. FiftyOne supports loading datasets in a variety of common
    formats out-of-the-box, and it also provides the extensibility to load
    datasets in custom formats.

    Check out our :doc:`loading common datasets<user_guide/dataset_creation>`
    guide to see how to load your data into FiftyOne today.

.. rubric:: The :doc:`FiftyOne App<user_guide/app>`

The **FiftyOne App** is a graphical user interface (GUI) that makes it easy to
rapidly gain intuition into your datasets. You can visualize labels, bounding
boxes and segmentations overlayed on the samples; sort, query and slice your
dataset into any aspect you need; and more.

.. image:: images/dog.png
   :alt: App
   :width: 75%
   :align: center
   :target: user_guide/app.html


.. rubric:: The :doc:`FiftyOne Brain<user_guide/brain>`

The **FiftyOne Brain** is a library of powerful machine learning-powered
:ref:`capabilities<Capabilities>` that can provide insights into your datasets
and recommend ways to modify your datasets that will improve the performance of
your models.

.. code-block:: python

   import fiftyone.brain as fob

   fob.compute_uniqueness(dataset)
   rank_view = dataset.view().sort_by("uniqueness")

What Next?
__________

Where should you go from here? You could...

* Start by :doc:`installing FiftyOne<getting_started/install>`.
* Try one of the :doc:`tutorials<tutorials/index>` that demonstrate the unique
  capabilities of FiftyOne.
* Explore :doc:`common recipes<common_recipes/index>` for integrating
  FiftyOne into your current workflow.
* Consult the :doc:`user guide<user_guide/index>` for detailed instructions on
  how to accomplish various tasks with FiftyOne.

Support
_______

If you run into any issue with FiftyOne that cannot be resolved wih this
documentation, feel free to reach out to us at support@voxel51.com.

.. toctree::
   :maxdepth: 1
   :hidden:

   getting_started/install
   tutorials/index
   common_recipes/index
   user_guide/index
   api/fiftyone
