.. _dataset-zoo-ecosystem:

Dataset Zoo Ecosystem
=====================

.. default-role:: code

Welcome to the FiftyOne Dataset Zoo! 🚀

Here you'll discover dozens of popular benchmark datasets, ready to download
and load into FiftyOne with a single command.

The FiftyOne Dataset Zoo provides access to a curated collection of datasets
from various sources, enabling you to quickly work with standard computer
vision datasets for your research and development.

.. raw:: html

    <div class="plugins-search-container">
        <div class="plugins-search-box">
            <input type="text" id="dataset-search" placeholder="Search datasets by name, description, or tags...">
            <div class="plugins-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
            </div>
        </div>
    </div>

.. customanimatedcta::
    :button_text: Learn more about Dataset Zoo
    :button_link: overview.html
    :align: right
    
.. Dataset cards section -----------------------------------------------------

.. raw:: html

    <div id="tutorial-cards-container">

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

.. Add dataset cards below

.. include:: dataset_zoo_ecosystem/dataset_cards.rst

.. End of dataset cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End Dataset cards section -------------------------------------------------

.. toctree::
   :maxdepth: 1
   :hidden:
   :glob:

   Overview <overview>
   Remote datasets <remote>
   API reference <api>
   dataset_zoo_ecosystem/*
