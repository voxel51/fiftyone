.. _user-guide-explore-curate:

Explore & Curate
================

.. default-role:: code

Good models are built on good data. Before sending samples to annotation and
after receiving labels back, you need to understand what is in your dataset —
find errors, surface edge cases, identify imbalances, and select the most
valuable samples to act on.

This section covers FiftyOne's tools for interactively exploring your data and
programmatically slicing it into the views you need.

**In this section:**

- :doc:`Using the App <app>` — Visually browse your dataset, overlay labels
  and predictions, apply filters, and interact with your data through the
  FiftyOne App. The fastest way to build intuition about your data.
- :doc:`Dataset views <using_views>` — Construct powerful queries to sort,
  filter, match, and slice your dataset into any subset of interest. Views are
  the primary interface for programmatic curation.
- :doc:`Using aggregations <using_aggregations>` — Efficiently compute
  statistics across your dataset or any view — label counts, value
  distributions, bounds, and more — without loading samples into memory.
- :doc:`Interactive plots <plots>` — Link scatter plots, histograms, and
  geolocation maps directly to your App session to visually explore embeddings,
  metadata distributions, and geographic data.

.. toctree::
   :maxdepth: 1
   :hidden:

   Using the App <app>
   Dataset views <using_views>
   Using aggregations <using_aggregations>
   Interactive plots <plots>
