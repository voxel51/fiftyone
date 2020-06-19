FiftyOne
========

*Data is king in the modern age of deep learning.*

If you are looking to boost your model performance, chances are improving
dataset quality is going to provide the highest return on investment.

Is bad data holding back the performance of your models? No? Are you sure?? Or
are you being overly optimistic?

**FiftyOne** is a cutting-edge, Python-based tool for the visual data scientist
to help in creating valuable and diverse datasets. Work efficiently to achieve
better models and clearer and more meaningful evaluation results.

What are some typical things I may be trying to achieve with FiftyOne?

Improving your dataset! The dataset should be dynamic and evolving part of the
machine learning "code". This means:

1. adding new samples that increase diversity
2. removing redundant samples that do not benefit performance and bloat the
   dataset unnecessarily
3. modifying labels due to annotation mistakes, change in schema, or something else

.. image:: images/video_placeholder.png
   :alt: Overview Video
   :width: 100%
   :align: center

Where to go from here? You could...

* start by :doc:`Installing FiftyOne<getting_started/install>`
* try one of the :doc:`Tutorials<tutorials/index>` that demonstrate the unique
  capabilites of FiftyOne
* explore the :doc:`Common Recipes<common_recipes/index>` for integrating
  FiftyOne into your current workflow
* check the :doc:`User Guide<user_guide/index>` for detailed "How To..." of
  a specific tasks you may be trying to accomplish
* view the :doc:`API Reference<api/fiftyone>`

Capabilities
____________

**FiftyOne** provides advanced capabilities that will turbocharge your
machine learning workflow.

* Automatically detect label annotation mistakes.
  :doc:`Try Now >><tutorials/label_mistakes/README>`
* Remove duplicate images.
  :doc:`Try Now >><tutorials/uniqueness/README>`
* Bootstrap your training dataset with raw images.
  **:doc:`TODO >>`**
* Add the optimal samples to your training dataset for improving your model’s
  performance.
  **:doc:`TODO >>`**

Concepts
________

**FiftyOne** is comprised of...

* a **core library** that provides a lightweight and structured yet dynamic
  dataset representation. Efficiently query and manipulate your dataset by
  adding custom tags, model predictions and more.
  :doc:`Learn More >><user_guide/basics>`
* a **GUI application** that makes it easy to rapidly gain intuitions.
  Visualize labels, bounding boxes and segmentations overlayed on the samples
  and sort, query and slice your dataset into any aspect you need.
  :doc:`Learn More >><user_guide/app>`
* the **FiftyOne Brain**, which provides powerful :ref:`Capabilities` for
  modifying datasets in ways that will best improve model performance.


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
