.. _workflows-curation-pre:

Curation: Pre-Annotation
========================

Before you spend time and budget on labeling, use FiftyOne to understand your
raw data and choose *what* to annotate. Typical pre-annotation curation
workflows include :ref:`visualizing embeddings <brain-embeddings-visualization>`
to explore the structure of your dataset, :ref:`similarity search
<brain-similarity>` (including :ref:`natural language queries
<brain-similarity-text>`), scoring samples by :ref:`uniqueness
<brain-image-uniqueness>`, pruning :ref:`near-duplicate
<brain-near-duplicates>` samples, and auditing your raw data with the
FiftyOne Enterprise Data Quality 🚀 panel.

In the FiftyOne App, the :ref:`Embeddings panel <app-embeddings-panel>` and
:ref:`similarity search <app-similarity-search-panel>` make these workflows
point-and-click, and :ref:`saved views <app-saving-views>` let you turn the
subsets you discover into named slices of your dataset.

.. toctree::
   :maxdepth: 1
   :hidden:

   Data Quality 🚀 <../enterprise/data_quality>
   Similarity Search <../user_guide/similarity>
   Using image embeddings <../tutorials/image_embeddings.ipynb>
   Dimensionality reduction <../tutorials/dimension_reduction.ipynb>
   Clustering images <../tutorials/clustering.ipynb>
   Exploring image uniqueness <../tutorials/uniqueness.ipynb>
   Removing duplicate images <../recipes/image_deduplication.ipynb>
