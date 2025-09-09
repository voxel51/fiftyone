.. _plugins-ecosystem:

Plugins Ecosystem
============================

.. default-role:: code

Welcome to the FiftyOne Plugins ecosystem! 🚀

Discover cutting-edge research, state-of-the-art models, and innovative techniques. These plugins extend the power of FiftyOne beyond imagination. From advanced computer vision models to specialized annotation tools, our curated collection transforms FiftyOne into your ultimate AI research platform.

.. raw:: html

    <div class="plugins-search-container">
        <div class="plugins-search-box">
            <input type="text" id="plugin-search" placeholder="Search plugins by name, description, author, or category...">
            <div class="plugins-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
            </div>
        </div>
    </div>

.. raw:: html

    <div style="margin:0; width: 100%; display:flex; justify-content:flex-end;">
        <a href="https://github.com/voxel51/fiftyone-plugins?tab=readme-ov-file#contributing" target="_blank" class="sd-btn sd-btn-primary book-a-demo plugins-cta" rel="noopener noreferrer">
            <div class="arrow">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="size-3">
                <path stroke="currentColor" stroke-width="1.5"
                        d="M1.458 11.995h20.125M11.52 22.063 21.584 12 11.521 1.937"
                        vector-effect="non-scaling-stroke"></path>
                </svg>  
            </div>
            <div class="text">Build your own plugin</div>
        </a>
    </div>
    
.. Plugins cards section -----------------------------------------------------

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

.. Add plugin cards below


.. customcarditem::
    :header: Vitpose ⭐ 3
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by harpreetsahota</span><br/>Run ViTPose Models from Hugging Face on your FiftyOne Dataset
    :link: plugins_ecosystem/vitpose.html
    :image: https://cdn.voxel51.com/zoo-predictions.webp
    :tags: Community


.. customcarditem::
    :header: Moondream2 ⭐ 3
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by harpreetsahota204</span><br/>A FiftyOne plugin for running inference with moondream2, a fast and open vision-language model.
    :link: plugins_ecosystem/moondream2.html
    :image: https://cdn.voxel51.com/yolo-predictions.webp
    :tags: Community,Model


.. customcarditem::
    :header: Multi Annotator Toolkit ⭐ 5
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by madave94</span><br/>Tackle noisy annotation! Find and analyze annotation issues in datasets with multiple annotators per image.
    :link: plugins_ecosystem/multi_annotator_toolkit.html
    :image: https://raw.githubusercontent.com/Madave94/multi-annotator-toolkit/master/assets/plugin-overview.png
    :tags: Community


.. customcarditem::
    :header: Zero Shot Prediction ⭐ 35
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Run zero-shot (open vocabulary) prediction on your data!
    :link: plugins_ecosystem/zero_shot_prediction.html
    :image: https://github.com/jacobmarks/zero-shot-prediction-plugin/assets/12500356/6aca099a-17b3-4f85-955d-26c3951f0646
    :tags: Community


.. customcarditem::
    :header: Voxelgpt ⭐ 248
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>An AI assistant that can query visual datasets, search the FiftyOne docs, and answer general computer vision questions
    :link: plugins_ecosystem/voxelgpt.html
    :image: https://cdn.voxel51.com/mistake-missing.webp
    :tags: Voxel51


.. customcarditem::
    :header: Annotation ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Utilities for integrating FiftyOne with annotation tools
    :link: plugins_ecosystem/annotation.html
    :image: https://cdn.sanity.io/images/h6toihm1/production/d286d778ffac5e30c2af62755808bf566dc5d3b6-2048x1148.webp
    :tags: Voxel51


.. customcarditem::
    :header: Brain ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Utilities for working with the FiftyOne Brain
    :link: plugins_ecosystem/brain.html
    :image: https://cdn.voxel51.com/zoo-predictions.webp
    :tags: Voxel51


.. customcarditem::
    :header: Dashboard ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Create your own custom dashboards from within the App
    :link: plugins_ecosystem/dashboard.html
    :image: https://cdn.voxel51.com/yolo-predictions.webp
    :tags: Voxel51


.. customcarditem::
    :header: Io ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>A collection of import/export utilities
    :link: plugins_ecosystem/io.html
    :image: https://cdn.voxel51.com/torchvision-predictions.webp
    :tags: Voxel51


.. customcarditem::
    :header: Indexes ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Utilities working with FiftyOne database indexes
    :link: plugins_ecosystem/indexes.html
    :image: https://cdn.voxel51.com/mistake-loc.webp
    :tags: Voxel51


.. customcarditem::
    :header: Plugins ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Utilities for managing and building FiftyOne plugins
    :link: plugins_ecosystem/plugins.html
    :image: https://github.com/voxel51/fiftyone-plugins/assets/12500356/19f1af29-7642-4b13-8317-01ba2a263e03
    :tags: Voxel51


.. customcarditem::
    :header: Delegated ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Utilities for managing your delegated operations
    :link: plugins_ecosystem/delegated.html
    :image: https://cdn.sanity.io/images/h6toihm1/production/d286d778ffac5e30c2af62755808bf566dc5d3b6-2048x1148.webp
    :tags: Voxel51


.. customcarditem::
    :header: Runs ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Utilities for managing your custom runs
    :link: plugins_ecosystem/runs.html
    :image: https://cdn.voxel51.com/zoo-predictions.webp
    :tags: Voxel51


.. customcarditem::
    :header: Utils ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Call your favorite SDK utilities from the App
    :link: plugins_ecosystem/utils.html
    :image: https://cdn.voxel51.com/yolo-predictions.webp
    :tags: Voxel51


.. customcarditem::
    :header: Zoo ⭐ 131
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Download datasets and run inference with models from the FiftyOne Zoo, all without leaving the App
    :link: plugins_ecosystem/zoo.html
    :image: https://cdn.voxel51.com/torchvision-predictions.webp
    :tags: Voxel51


.. customcarditem::
    :header: Vqa-plugin ⭐ 19
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Ask (and answer) open-ended visual questions about your images!
    :link: plugins_ecosystem/vqa_plugin.html
    :image: https://github.com/jacobmarks/vqa-plugin/assets/12500356/67819454-19e3-4b4a-861f-afed465f4866
    :tags: Community


.. customcarditem::
    :header: Segments-voxel51-plugin ⭐ 5
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by segmentsai</span><br/>Integrate FiftyOne with the Segments.ai annotation tool!
    :link: plugins_ecosystem/segments_voxel51_plugin.html
    :image: https://cdn.voxel51.com/mistake-missing.webp
    :tags: Community


.. customcarditem::
    :header: Florence2 ⭐ 13
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Connect Microsoft's Florence-2 Vision-Language Model to your data!
    :link: plugins_ecosystem/florence2.html
    :image: https://raw.githubusercontent.com/jacobmarks/fiftyone_florence2_plugin/main/assets/florence2-plugin.gif
    :tags: Community


.. customcarditem::
    :header: Youtube Panel Plugin ⭐ 6
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Play YouTube videos in the FiftyOne App!
    :link: plugins_ecosystem/youtube_panel_plugin.html
    :image: https://github.com/jacobmarks/fiftyone-youtube-panel-plugin/assets/12500356/0b33b0ea-90cb-4068-b055-6c95c7ce3484
    :tags: Community


.. customcarditem::
    :header: Active Learning ⭐ 17
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Accelerate your data labeling with Active Learning!
    :link: plugins_ecosystem/active_learning.html
    :image: https://github.com/jacobmarks/active-learning-plugin/assets/12500356/aadcfa66-1e0f-4a56-b86f-07850bfae94a
    :tags: Community


.. customcarditem::
    :header: Mlflow ⭐ 5
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Track model training experiments on your FiftyOne datasets with MLflow!
    :link: plugins_ecosystem/mlflow.html
    :image: https://cdn.voxel51.com/torchvision-predictions.webp
    :tags: Voxel51


.. customcarditem::
    :header: Image Issues ⭐ 33
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Find common image quality issues in your datasets
    :link: plugins_ecosystem/image_issues.html
    :image: https://github.com/jacobmarks/image-quality-issues/assets/12500356/4f3b89c9-58b6-4404-a9da-8cd6570a1793
    :tags: Community


.. customcarditem::
    :header: Edit Label Attributes ⭐ 3
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by ehofesmann</span><br/>Edit attributes of your labels directly in the FiftyOne App!
    :link: plugins_ecosystem/edit_label_attributes.html
    :image: https://github.com/ehofesmann/edit_label_attributes/assets/21222883/cb345e94-71a0-49c9-b782-dd484ed9f0d6
    :tags: Community


.. customcarditem::
    :header: Fiftyone-tile ⭐ 1
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by mmoollllee</span><br/>Tile your high resolution images to squares for training small object detection models
    :link: plugins_ecosystem/fiftyone_tile.html
    :image: https://raw.githubusercontent.com/mmoollllee/fiftyone-tile/main/screenshot.png
    :tags: Community


.. customcarditem::
    :header: Hiera Video Embeddings ⭐ 3
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by harpreetsahota</span><br/>Compute embeddings for video using Facebook Hiera Models
    :link: plugins_ecosystem/hiera_video_embeddings.html
    :image: https://cdn.voxel51.com/zoo-predictions.webp
    :tags: Community


.. customcarditem::
    :header: Anonymize ⭐ 5
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by swheaton</span><br/>Anonymize/blur images based on a FiftyOne Detections field.
    :link: plugins_ecosystem/anonymize.html
    :image: https://github.com/swheaton/fiftyone-media-anonymization-plugin/assets/6363888/ade04386-bb3a-493c-a02f-2a2e176fd373
    :tags: Community


.. customcarditem::
    :header: Multimodal Rag ⭐ 20
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Create and test multimodal RAG pipelines with LlamaIndex, Milvus, and FiftyOne!
    :link: plugins_ecosystem/multimodal_rag.html
    :image: https://cdn.voxel51.com/torchvision-predictions.webp
    :tags: Community


.. customcarditem::
    :header: Moondream2 ⭐ 7
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by harpreetsahota</span><br/>Run Moondream2 Models from Hugging Face on your FiftyOne Dataset
    :link: plugins_ecosystem/moondream2.html
    :image: https://cdn.voxel51.com/mistake-loc.webp
    :tags: Community


.. customcarditem::
    :header: Pytesseract Ocr ⭐ 11
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Run optical character recognition with PyTesseract!
    :link: plugins_ecosystem/pytesseract_ocr.html
    :image: https://img.youtube.com/vi/jnNPGrM6Wr4/0.jpg
    :tags: Community


.. customcarditem::
    :header: Reverse Image Search ⭐ 13
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Find the images in your dataset most similar to an image from filesystem or the internet!
    :link: plugins_ecosystem/reverse_image_search.html
    :image: https://github.com/jacobmarks/reverse-image-search-plugin/assets/12500356/cc2df982-891a-4cef-967e-67d583134d25
    :tags: Community


.. customcarditem::
    :header: Semantic Video Search ⭐ 21
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by danielgural</span><br/>search through your video datasets using FiftyOne Brain and Twelve Labs!
    :link: plugins_ecosystem/semantic_video_search.html
    :image: https://raw.githubusercontent.com/danielgural/semantic_video_search/main/assets/video_semantic_search.gif
    :tags: Community


.. customcarditem::
    :header: Audio Retrieval ⭐ 10
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Find the images in your dataset most similar to an audio file!
    :link: plugins_ecosystem/audio_retrieval.html
    :image: https://img.youtube.com/vi/dn5DA4H9b-o/0.jpg
    :tags: Community


.. customcarditem::
    :header: Pdf-loader ⭐ 2
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by brimoor</span><br/>Load your PDF documents into FiftyOne as per-page images
    :link: plugins_ecosystem/pdf_loader.html
    :image: https://cdn.voxel51.com/torchvision-predictions.webp
    :tags: Community


.. customcarditem::
    :header: Clustering Algorithms ⭐ 3
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by danielgural</span><br/>Find the clusters in your data using some of the best algorithms available!
    :link: plugins_ecosystem/clustering_algorithms.html
    :image: https://raw.githubusercontent.com/danielgural/clustering_algorithms/main/assets/cluster.gif
    :tags: Community


.. customcarditem::
    :header: Aimv2 Embeddings ⭐ 2
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by harpreetsahota</span><br/>Compute embeddings using AIMv2 Models
    :link: plugins_ecosystem/aimv2_embeddings.html
    :image: https://cdn.voxel51.com/mistake-missing.webp
    :tags: Community


.. customcarditem::
    :header: Audio Loader ⭐ 5
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by danielgural</span><br/>Import your audio datasets as spectograms into FiftyOne!
    :link: plugins_ecosystem/audio_loader.html
    :image: https://raw.githubusercontent.com/danielgural/audio_loader/main/assets/audio.gif
    :tags: Community


.. customcarditem::
    :header: Fiftyone-vlm-efficient ⭐ 4
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by AdonaiVera</span><br/>Improve VLM training data quality with state-of-the-art dataset pruning and quality techniques
    :link: plugins_ecosystem/fiftyone_vlm_efficient.html
    :image: https://cdn.voxel51.com/zoo-predictions.webp
    :tags: Community


.. customcarditem::
    :header: Image Captioning ⭐ 9
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Caption all your images with state of the art vision-language models!
    :link: plugins_ecosystem/image_captioning.html
    :image: https://github.com/jacobmarks/fiftyone-image-captioning-plugin/assets/12500356/224503c0-c3ac-4925-8c9d-ecfe50d493cc
    :tags: Community


.. customcarditem::
    :header: Clustering ⭐ 10
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Cluster your images using embeddings with FiftyOne and scikit-learn!
    :link: plugins_ecosystem/clustering.html
    :image: https://github.com/jacobmarks/clustering-runs-plugin/assets/12500356/27b0ace4-ecd8-4f9d-821a-614fd597be7f
    :tags: Community


.. customcarditem::
    :header: Albumentations Augmentation ⭐ 13
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Test out any Albumentations data augmentation transform with FiftyOne!
    :link: plugins_ecosystem/albumentations_augmentation.html
    :image: https://github.com/jacobmarks/fiftyone-albumentations-plugin/assets/12500356/bd2014be-bec0-4f4d-a0bd-6709921b5bb9
    :tags: Community


.. customcarditem::
    :header: Image Deduplication ⭐ 18
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Find exact and approximate duplicates in your dataset!
    :link: plugins_ecosystem/image_deduplication.html
    :image: https://img.youtube.com/vi/aingeh0KdPw/0.jpg
    :tags: Community


.. customcarditem::
    :header: Emoji Search ⭐ 7
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Semantically search emojis and copy to clipboard!
    :link: plugins_ecosystem/emoji_search.html
    :image: https://github.com/jacobmarks/emoji-search-plugin/assets/12500356/a8fc3680-7df0-463c-9e5a-d70e773d5c29
    :tags: Community


.. customcarditem::
    :header: Janus Vqa ⭐ 6
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by harpreetsahota</span><br/>Run the Janus Pro Models from Deepseek on your Fiftyone Dataset
    :link: plugins_ecosystem/janus_vqa.html
    :image: https://raw.githubusercontent.com/harpreetsahota204/janus-vqa-fiftyone/main/assets/app-ui.png
    :tags: Community


.. customcarditem::
    :header: Model-comparison ⭐ 13
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by allenleetc</span><br/>Compare two object detection models!
    :link: plugins_ecosystem/model_comparison.html
    :image: https://cdn.voxel51.com/yolo-predictions.webp
    :tags: Community


.. customcarditem::
    :header: Depth Pro Plugin ⭐ 2
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by harpreetsahota</span><br/>Perfom zero-shot metric monocular depth estimation using the Apple Depth Pro model
    :link: plugins_ecosystem/depth_pro_plugin.html
    :image: https://cdn.voxel51.com/torchvision-predictions.webp
    :tags: Community


.. customcarditem::
    :header: Optimal Confidence Threshold ⭐ 5
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by danielgural</span><br/>Find the optimal confidence threshold for your detection models automatically!
    :link: plugins_ecosystem/optimal_confidence_threshold.html
    :image: https://raw.githubusercontent.com/danielgural/optimal_confidence_threshold/main/assets/conf_output.png
    :tags: Community


.. customcarditem::
    :header: Outlier Detection ⭐ 7
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by danielgural</span><br/>Find those troublesome outliers in your dataset automatically!
    :link: plugins_ecosystem/outlier_detection.html
    :image: https://raw.githubusercontent.com/danielgural/outlier_detection/main/assets/outlier.gif
    :tags: Community


.. customcarditem::
    :header: Text To Image ⭐ 33
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Add synthetic data from prompts with text-to-image models and FiftyOne!
    :link: plugins_ecosystem/text_to_image.html
    :image: https://github.com/jacobmarks/ai-art-gallery/assets/12500356/f5202d68-c5c1-44c7-b662-98d98e5c05aa
    :tags: Community


.. customcarditem::
    :header: Semantic Document Search ⭐ 8
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Perform semantic search on text in your documents!
    :link: plugins_ecosystem/semantic_document_search.html
    :image: https://github.com/jacobmarks/semantic-document-search-plugin/assets/12500356/ac87511d-c3f9-4718-891d-89e14aef4152
    :tags: Community


.. customcarditem::
    :header: Plotly-map-panel ⭐ 0
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by allenleetc</span><br/>Plotly-based Map Panel with adjustable marker cosmetics!
    :link: plugins_ecosystem/plotly_map_panel.html
    :image: https://cdn.voxel51.com/yolo-predictions.webp
    :tags: Community


.. customcarditem::
    :header: Concept Space Traversal ⭐ 5
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Navigate concept space with CLIP, vector search, and FiftyOne!
    :link: plugins_ecosystem/concept_space_traversal.html
    :image: https://github.com/jacobmarks/concept-space-traversal-plugin/assets/12500356/50e833a1-9198-41dc-852e-7def33061138
    :tags: Community


.. customcarditem::
    :header: Concept Interpolation ⭐ 6
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Find images that best interpolate between two text-based extremes!
    :link: plugins_ecosystem/concept_interpolation.html
    :image: https://github.com/voxel51/fiftyone-plugins/assets/12500356/602e1049-75d7-4b54-bc5d-9e651d39b9c3
    :tags: Community


.. customcarditem::
    :header: Gpt4 Vision ⭐ 9
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Chat with your images using GPT-4 Vision!
    :link: plugins_ecosystem/gpt4_vision.html
    :image: https://github.com/jacobmarks/gpt4-vision-plugin/assets/12500356/722c95d7-4c60-4138-8c9d-c5c26074297b
    :tags: Community


.. customcarditem::
    :header: Huggingface Hub ⭐ 1
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Push FiftyOne datasets to the Hugging Face Hub, and load datasets from the Hub into FiftyOne!
    :link: plugins_ecosystem/huggingface_hub.html
    :image: https://cdn.sanity.io/images/h6toihm1/production/d286d778ffac5e30c2af62755808bf566dc5d3b6-2048x1148.webp
    :tags: Voxel51


.. customcarditem::
    :header: Transformers ⭐ 1
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by voxel51</span><br/>Run inference on your datasets using Hugging Face Transformers models!
    :link: plugins_ecosystem/transformers.html
    :image: https://cdn.voxel51.com/zoo-predictions.webp
    :tags: Voxel51


.. customcarditem::
    :header: Fiftyone-timestamps ⭐ 1
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by mmoollllee</span><br/>Compute datetime-related fields (sunrise, dawn, evening, weekday, ...) from your samples' filenames or creation dates
    :link: plugins_ecosystem/fiftyone_timestamps.html
    :image: https://raw.githubusercontent.com/mmoollllee/fiftyone-timestamps/main/screenshot.png
    :tags: Community


.. customcarditem::
    :header: Keyword Search ⭐ 3
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Perform keyword search on a specified field!
    :link: plugins_ecosystem/keyword_search.html
    :image: https://github.com/jacobmarks/keyword-search-plugin/assets/12500356/08fcf04d-35c5-45e5-b950-ba732da26d14
    :tags: Community


.. customcarditem::
    :header: Img To Video ⭐ 1
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by danielgural</span><br/>Bring images to life with image to video!
    :link: plugins_ecosystem/img_to_video.html
    :image: https://raw.githubusercontent.com/danielgural/img_to_video_plugin/main/assets/stable_video_diffusion.gif
    :tags: Community


.. customcarditem::
    :header: Double Band Filter ⭐ 2
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>on two numeric ranges simultaneously!
    :link: plugins_ecosystem/double_band_filter.html
    :image: https://github.com/jacobmarks/double-band-filter-plugin/assets/12500356/5e51740b-f528-40ea-acb1-f66358b69aaa
    :tags: Community


.. customcarditem::
    :header: Filter Values ⭐ 1
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by ehofesmann</span><br/>Filter a field of your FiftyOne dataset by one or more values.
    :link: plugins_ecosystem/filter_values.html
    :image: https://github.com/ehofesmann/filter-values-plugin/assets/21222883/bbed0b1c-c917-4bea-a48f-550ffa237dc9
    :tags: Community


.. customcarditem::
    :header: Line2d ⭐ 4
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by wayofsamu</span><br/>Visualize x,y-Points as a line chart.
    :link: plugins_ecosystem/line2d.html
    :image: https://raw.githubusercontent.com/wayofsamu/line2d/main/assets/thumbnails.png
    :tags: Community


.. customcarditem::
    :header: Twilio Automation ⭐ 2
    :description: <span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by jacobmarks</span><br/>Automate data ingestion with Twilio!
    :link: plugins_ecosystem/twilio_automation.html
    :image: https://github.com/jacobmarks/twilio-automation-plugin/assets/12500356/5c25c312-9890-4bd3-b194-ca33ee0819fd
    :tags: Community


.. End of plugin cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

    

.. End plugins cards section -------------------------------------------------

.. note::
   Community plugins are external projects maintained by their respective authors. They are not
   part of FiftyOne core and may change independently. Review each plugin's documentation and
   license before use.

.. toctree::
   :maxdepth: 1
   :hidden:
   :glob:

   Overview <overview>
   Using plugins <using_plugins>
   Developing plugins <developing_plugins>
   plugins_ecosystem/*
   API reference <api/plugins>
   TypeScript API reference <ts-api>

