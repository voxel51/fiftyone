.. _terminology-cheat-sheet:

FiftyOne terminology
=====================

.. default-role:: code

A cheat sheet introducing you to the key terminology in the world of FiftyOne!


.. _basic-terminology:

The basics
____________

.. list-table::
   :widths: 20 80

   * - **FiftyOne**
     - The open-source framework, the core library, and the Python SDK
   * - **FiftyOne App**
     - | The GUI attached to FiftyOne for graphically viewing, filtering, and understanding 
       | your computer vision data. Can be launched within an IPython notebook, 
       | in the browser, or as a standalone desktop app.
   * - **FiftyOne Teams**
     - | The enterprise-grade suite built on top of FiftyOne for collaboration,
       | permissioning, and working with cloud-backed media

.. _fiftyone-components-terminology:

Components of FiftyOne
_______________________

.. list-table::
   :widths: 20 80

   * - **Brain**
     - Library of ML-powered capabilities for computation and visualization
   * - **Model Zoo**
     - Collection of pre-trained models available for download and inference
   * - **Dataset Zoo**
     - | Collection of common datasets available for download and loading into 
       | FiftyOne
   * - **Plugin**
     - A module you can use to customize and extend the behavior of FiftyOne
   * - **Integration**
     - | A dataset, ML framework, annotation service, or other tool FiftyOne is 
       | directly compatible with


.. _data-schema-terminology:

Data Schema
_________________

.. list-table::
   :widths: 20 80

   * - **Sample**
     - | The atomic elements of a ``Dataset`` that store all the information 
       | related to a given piece of data. Every sample has an associated 
       | media file. Computer vision analog of a row in a table
   * - **Dataset**
     - | Core data structure in FiftyOne, composed of ``Samples``. Consistent 
       | interface for loading images, videos, annotations, and predictions.
       | Computer vision analog of a table of data
   * - **DatasetView**
     - | A view into a ``Dataset``, which can be filtered, sorted, sampled, etc. 
       | along various axes to obtain a desired subset of the samples.
   * - **ViewStage**
     - | A logical operation, such as filtering, matching, or sorting, which can
       | be used to generate a ``DatasetView``
   * - **Field**
     - | Attributes of ``Sample`` instances that store customizable information
       |  about the samples. Computer vision analog of a column in a table
   * - **Embedded Field**
     - | A collection of related fields organized under a single top-level
       | field, similar to a nested dictionary.
   * - **Label**
     - | Class hierarchy used to store semantic information about ground truth 
       | or predicted labels in a sample. Built in ``Label`` types include 
       | ``Detections``, ``Classification``, and ``Keypoints`` among others
   * - **Tag**
     - | A field containing a list of strings representing relevant information.
       | Tags can be on the dataset, sample, or label level.
   * - **Metadata**
     - | A ``Sample`` level field which can optionally store data type-specific
       | metadata about the raw data in the sample.
   * - **Aggregation**
     - | A class encapsulating the computation of an aggregate statistic about a
       | dataset.

.. _app-terminology:

The FiftyOne App
_______________________

.. list-table::
   :widths: 20 80

   * - **Session**
     - | An instance of the FiftyOne App connected to a specific dataset, via 
       | which you can use to programmatically interact with the app.
   * - **Sample grid**
     - | The rectangular grid of images or videos you can scroll through. You 
       | can click on any image or video in the grid to expand
   * - **Sidebar**
     - | Vertical component on left side of app which allows for toggling labels on/off, 
       | filtering by class or id, or by numerical value ranges
   * - **Viewbar**
     - | Horizontal bar at the top of the app where you can create and compose
       | view stages via point and click operations






