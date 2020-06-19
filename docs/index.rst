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

FiftyOne provides advanced capabilities that will turbocharge your
machine learning workflow.

.. rubric:: :doc:`Detection of Annotation Mistakes<tutorials/label_mistakes>`:

Automatically detect label annotation mistakes.

.. rubric:: :doc:`Remove Redundant Images<tutorials/uniqueness/README>`:

Find and remove similar samples in your dataset to reduce
redundancy.

.. rubric:: :doc:`Bootstrap a Training Dataset<tutorials/???>`:

Bootstrap your training dataset with raw images.

.. rubric:: :doc:`Add Optimal New Samples<tutorials/???>`:

Add the optimal samples to your training dataset for improving your model’s
performance.

Concepts
________

.. rubric:: :doc:`FiftyOne Core Library<user_guide/basics>`:

The **Core Library** provides a structured yet dynamic dataset representation.
Efficiently query and manipulate your dataset by adding custom tags, model
predictions and more.

.. code-block:: python
   :linenos:

   import fiftyone as fo

   dataset = fo.Dataset(name="my_dataset")
   sample = fo.Sample(filepath="path/to/img.png")
   dataset.add_sample(sample)
   sample.tags += ["train"]
   sample["integer_field"] = 51
   view = dataset.view().match_tag("test").sort_by("integer_field")[5:10]
   for sample in view:
       ...

.. note::
   FiftyOne is designed to be lightweight by default. See our
   :doc:`Loading a Dataset<user_guide/making_dataset>`
   guide to find out how to get your data into FiftyOne.


.. rubric:: :doc:`Interactive Visual App<user_guide/app>`:

The **App** makes it easy to rapidly gain intuitions. Visualize labels,
bounding boxes and segmentations overlayed on the samples and sort, query and
slice your dataset into any aspect you need.

.. image:: images/dog.png
   :alt: App
   :width: 75%
   :align: center
   :target: user_guide/app.html

.. rubric:: :doc:`FiftyOne Brain<user_guide/brain>`:

The **Brain** provides powerful :ref:`capabilities<Capabilities>` for modifying datasets in
ways that will best improve model performance.

.. code-block:: python
   :linenos:

   import fiftyone.brain as fob

   fob.compute_uniqueness(dataset)
   rank_view = dataset.view().sort_by("uniqueness")

What Next?
__________

Where should you go from here? You could...

* start by :doc:`installing FiftyOne<getting_started/install>`.
* try one of the :doc:`tutorials<tutorials/index>` that demonstrate the unique
  capabilities of FiftyOne.
* explore the :doc:`common recipes<common_recipes/index>` for integrating
  FiftyOne into your current workflow.
* check the :doc:`user guides<user_guide/index>` for detailed "How To..." of a
  specific task you are trying to accomplish.

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
