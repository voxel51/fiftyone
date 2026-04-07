.. _data-centric-ml-workflow:

Data-Centric ML Workflow
========================

.. default-role:: code

FiftyOne is designed around the data-centric ML lifecycle — from ingesting raw
data and curating it for annotation, through evaluating trained models and
iteratively improving your dataset.

.. raw:: html

    <div id="tutorial-cards-container">

    <nav class="navbar navbar-expand-lg navbar-light tutorials-nav col-12">
        <div class="tutorial-tags-container">
            <div id="dropdown-filter-tags">
                <div class="tutorial-filter-menu">
                    <div class="tutorial-filter filter-btn all-tag-selected" data-tag="all">All</div>
                </div>
            </div>
        </div>
    </nav>

    <hr class="tutorials-hr">

    <div class="row">

    <div id="tutorial-cards">
    <div class="list">

.. customcarditem::
    :header: FiftyOne Fundamentals
    :description: Get up to speed with FiftyOne's core concepts — datasets, samples, fields, labels, and tags — and learn how to manage your data programmatically.
    :link: fundamentals_section.html
    :tags: Fundamentals

.. customcarditem::
    :header: Data Ingestion
    :description: Load data into FiftyOne from standard formats, custom sources, or the Dataset Zoo. Work with grouped datasets for multiview and multimodal data.
    :link: data_ingestion_section.html
    :tags: Data-Ingestion

.. customcarditem::
    :header: Explore & Curate
    :description: Visualize datasets in the FiftyOne App, build dataset views, compute aggregations, and use interactive plots to understand and curate your data.
    :link: explore_curate_section.html
    :tags: Explore,Curate

.. customcarditem::
    :header: Annotation __SUB_NEW__
    :description: Use built-in or custom integrations to add or edit labels on your FiftyOne datasets, closing the loop between data curation and model training.
    :link: annotation_section.html
    :tags: Annotation

.. customcarditem::
    :header: Model Evaluation __SUB_NEW__
    :description: Use FiftyOne's built-in evaluation methods to assess your models, analyze failure modes, and understand performance across classes and splits.
    :link: evaluation_section.html
    :tags: Evaluation

.. customcarditem::
    :header: Utilities
    :description: Export datasets to common formats, render labels on samples, and configure FiftyOne's default behavior to suit your needs.
    :link: utilities_section.html
    :tags: Utilities

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. toctree::
    :maxdepth: 1
    :hidden:

    FiftyOne Fundamentals <fundamentals_section>
    Data Ingestion <data_ingestion_section>
    Explore & Curate <explore_curate_section>
    Annotation __SUB_NEW__ <annotation_section>
    Model Evaluation __SUB_NEW__ <evaluation_section>
    Utilities <utilities_section>
