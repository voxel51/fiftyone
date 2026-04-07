.. _user-guide-utilities:

Utilities
=========

.. default-role:: code

Supporting tools that complement every phase of the ML lifecycle — export your
curated datasets for training, render labels as overlays for visual inspection,
and tune FiftyOne's behavior to fit your environment.

**In this section:**

- :doc:`Exporting datasets <export_datasets>` — Export datasets or any view to
  disk in standard formats (COCO, YOLO, VOC, CSV, and more) or custom formats.
  Use this to hand off curated data to your training pipeline.
- :doc:`Drawing labels on samples <draw_labels>` — Render label fields as
  visual overlays directly onto your image or video samples. Useful for
  generating annotated media for reports or debugging.
- :doc:`Configuring FiftyOne <config>` — Customize FiftyOne's default
  behavior — database location, default App settings, Zoo directories, and
  more — via config files or environment variables.

.. toctree::
   :maxdepth: 1
   :hidden:

   Exporting datasets <export_datasets>
   Drawing labels on samples <draw_labels>
   Configuring FiftyOne <config>
