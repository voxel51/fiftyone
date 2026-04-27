.. _labs-ecosystem:

FiftyOne Labs
=============

.. default-role:: code

`FiftyOne Labs <https://github.com/voxel51/fiftyone-labs>`_ brings research solutions and experimental features for machine
learning. Here you'll find cutting-edge experiments, novel workflows, and
advanced capabilities built using the
:ref:`FiftyOne plugins ecosystem <plugins-ecosystem>`.

Labs features are organized into two categories, machine learning experiments
and advanced visualization tools, and are developed by the Voxel51 team.

.. raw:: html

    <div class="plugins-search-container">
        <div class="plugins-search-box">
            <input type="text" id="plugin-search" placeholder="Search labs features by name, description, or category...">
            <div class="plugins-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
            </div>
        </div>
    </div>

.. customanimatedcta::
    :button_text: Explore FiftyOne Labs on GitHub
    :button_link: https://github.com/voxel51/fiftyone-labs
    :align: right

.. Labs cards section ---------------------------------------------------------

.. raw:: html

    <div id="plugin-cards-container">

    <nav class="navbar navbar-expand-lg navbar-light tutorials-nav col-12">
        <div class="tutorial-tags-container">
            <div id="dropdown-filter-tags">
                <div class="tutorial-filter-menu">
                    <div class="tutorial-filter filter-btn all-tag-selected" data-tag="all">All</div>
                </div>
            </div>
        </nav>

    <hr class="tutorials-hr">

    <div class="row">

    <div id="tutorial-cards">
    <div class="list">

.. Add labs cards below

.. include:: labs_ecosystem/lab_cards.rst

.. End of labs cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End labs cards section -----------------------------------------------------

.. note::

   FiftyOne Labs features are experimental and may change independently of
   FiftyOne core. Please review each feature's documentation before use.

.. toctree::
   :maxdepth: 1
   :hidden:
   :glob:

   labs_ecosystem/*
