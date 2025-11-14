.. _model-zoo:

Model Zoo
=========

.. default-role:: code

Welcome to the FiftyOne Model Zoo! 🚀

Here you'll discover state-of-the-art computer vision models, pre-trained on
various datasets and ready to use with your FiftyOne datasets.

The FiftyOne Model Zoo provides access to a curated collection of models
from popular frameworks like PyTorch and TensorFlow, enabling you to quickly
apply cutting-edge computer vision techniques to your data.

.. raw:: html

    <div class="plugins-search-container">
        <div class="plugins-search-box">
            <input type="text" id="model-search" placeholder="Search models by name, description, or tags...">
            <div class="plugins-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
            </div>
        </div>
    </div>

.. customanimatedcta::
    :button_text: Learn more about the Model Zoo
    :button_link: overview.html
    :align: right
    
.. Model cards section -----------------------------------------------------

.. raw:: html

    <div id="model-cards-container">

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

.. Add model cards below

.. include:: models/model_cards.rst

.. End of model cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End Model cards section -------------------------------------------------

.. toctree::
   :maxdepth: 1
   :hidden:
   :glob:

   Overview <overview>
   Remote models <remote>
   Model interface <design>
   API reference <api>
   models/*
