User Guides
===========

.. default-role:: code

.. rubric:: :doc:`FiftyOne Dataset Basics <basics>`: 

Learn about FiftyOne `Datasets` and their relation to `Samples`, `Fields`,
`Tags` and `Views`

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


.. rubric:: :doc:`Loading a Dataset <dataset_creation/index>`: 

Load a `Dataset` either using an
existing supported dataset format or from scratch

.. code-block:: python
   :linenos:

   dataset = fo.Dataset.from_image_classification_dataset(dataset_dir)


.. rubric:: :doc:`Using a Dataset <using_dataset>`: 

Use your `Dataset` to search, sort, and modify your 
data

.. code-block:: python
   :linenos:

   view = (
       dataset.view()
       .match({"tags": "test"})
       .exists("metadata")
       .sort_by("filepath")[:3]
       .take(2)
   )

.. rubric:: :doc:`Viewing Datasets in the App <app>`: 

Visualize your `Dataset` in the FiftyOne App and see your changes in real time. 

.. image:: ../images/dog.png
   :alt: App
   :width: 75%
   :align: center
   :target: app.html


.. rubric:: :doc:`FiftyOne Brain <brain>`: 

Use the FiftyOne Brain to automatically get insights into your `Dataset`

.. code-block:: python
   :linenos:

   import fiftyone.brain as fob

   fob.compute_uniqueness(dataset)
   rank_view = dataset.view().sort_by("uniqueness")



.. toctree::
   :maxdepth: 1
   :hidden:
   
   basics
   dataset_creation/index
   using_dataset
   app
   brain
   cli
