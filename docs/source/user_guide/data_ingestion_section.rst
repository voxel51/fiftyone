.. _user-guide-data-ingestion:

Data Ingestion
==============

.. default-role:: code

The first step of any ML workflow is getting your data into FiftyOne. This
section covers all the ways to load raw media and labels into a |Dataset| —
whether your data lives on disk in a standard format, comes from a stream of
in-memory samples, or involves multiple sensors or viewpoints.

FiftyOne never copies your media — samples store only the filepath, so loading
even large datasets is fast and lightweight.

**In this section:**

- :doc:`Importing data <import_datasets>` — Load datasets from disk using
  built-in format support (COCO, YOLO, VOC, and more), custom importers, or
  the Dataset Zoo. The most common starting point.
- :doc:`Grouped datasets <groups>` — Represent multiview or multimodal data
  (e.g., left/center/right cameras, image + point cloud pairs) by organizing
  samples into named groups.
- :doc:`Using sample parsers <sample_parsers>` — Add samples from a stream of
  in-memory data using the |SampleParser| interface. Useful when your data
  pipeline produces samples programmatically rather than from disk.

.. toctree::
   :maxdepth: 1
   :hidden:

   Importing data <import_datasets>
   Grouped datasets <groups>
   Using sample parsers <sample_parsers>
