FiftyOne Tutorials
==================

.. default-role:: code

Welcome to FiftyOne tutorials!

Each tutorial below is a curated demonstration of how FiftyOne can help refine
your datasets and turn your good models into *great models*.

.. Tutorial cards section -----------------------------------------------------

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

.. Add tutorial cards below

.. customcarditem::
    :header: Exploring image uniqueness
    :description: Your models need diverse data. This tutorial shows how FiftyOne can remove near-duplicate images and recommend unique samples for model training.
    :link: uniqueness.html
    :image: ../_static/images/tutorials/uniqueness.png
    :tags: Getting-Started,Brain

.. customcarditem::
    :header: Finding label mistakes
    :description: Better models start with better data. This tutorial shows how FiftyOne can automatically find possible label mistakes in your datasets.
    :link: label_mistakes.html
    :image: ../_static/images/tutorials/label_mistakes.png
    :tags: Getting-Started,Brain

.. End of tutorial cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End tutorial cards section -------------------------------------------------

.. toctree::
   :maxdepth: 1
   :hidden:

   Exploring image uniqueness<uniqueness.ipynb>
   Finding label mistakes<label_mistakes.ipynb>
