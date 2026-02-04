FiftyOne
========

.. raw:: html

  <style>
    /* Hero Section Styles */
    .docs-hero {
      text-align: center;
      padding: 40px 20px 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    .docs-hero-label {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #ff6d04;
      margin-bottom: 16px;
    }
    
    .docs-hero h1 {
      font-size: 2.5rem;
      font-weight: 500;
      margin-bottom: 24px;
      color: var(--pst-color-text-base);
    }
    
    .docs-hero h1 .wave {
      display: inline-block;
      margin-right: 8px;
    }
    
    /* Search Box Styles */
    .docs-search-container {
      max-width: 600px;
      margin: 0 auto 24px;
      position: relative;
    }
    
    .docs-search-box {
      width: 100%;
      padding: 16px 100px 16px 48px;
      font-size: 1rem;
      border: 1px solid var(--pst-border-color);
      border-radius: 12px;
      background: var(--color-dropdown-background, #fff);
      color: var(--pst-color-text-base);
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      cursor: pointer;
    }
    
    .docs-search-box:hover {
      border-color: #ccc;
    }
    
    .docs-search-icon {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: #888;
      pointer-events: none;
    }
    
    .docs-search-ai-btn {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: #f0f0f0;
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      color: #333;
      transition: background 0.2s;
    }
    
    .docs-search-ai-btn:hover {
      background: #e0e0e0;
    }
    
    /* Quick Action Buttons - Black pills */
    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    
    .quick-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: #1a1a1a;
      color: #fff !important;
      border-radius: 28px;
      font-size: 0.9rem;
      font-weight: 500;
      text-decoration: none !important;
      transition: background 0.2s;
    }
    
    .quick-action-btn:hover {
      background: #333;
      color: #fff !important;
    }
    
    /* Icon Links Row - Boxy pill style with borders */
    .icon-links-row {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 32px;
    }
    
    .icon-link-box {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 12px 24px;
      background: var(--color-dropdown-background, #fff);
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      color: var(--pst-color-text-base) !important;
      text-decoration: none !important;
      font-size: 0.95rem;
      font-weight: 500;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    
    .icon-link-box:hover {
      border-color: #ccc;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    
    .icon-link-box svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    
    /* Popular Topics Section */
    .popular-topics {
      max-width: 900px;
      margin: 0 auto 40px;
      padding: 0 20px;
    }
    
    .popular-topics h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 20px;
      color: var(--pst-color-text-base);
    }
    
    .topics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    
    @media (max-width: 768px) {
      .topics-grid {
        grid-template-columns: 1fr;
      }
      .icon-links-row {
        gap: 8px;
      }
      .icon-link-box {
        padding: 10px 16px;
        font-size: 0.85rem;
      }
    }
    
    .topic-card {
      background: var(--color-dropdown-background, #f8f8f8);
      border: 1px solid var(--pst-border-color);
      border-radius: 12px;
      padding: 20px;
      text-decoration: none !important;
      transition: border-color 0.2s, box-shadow 0.2s;
      display: block;
    }
    
    .topic-card:hover {
      border-color: #ff6d04;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
    
    .topic-card-icon {
      font-size: 2rem;
      margin-bottom: 12px;
    }
    
    .topic-card h3 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--pst-color-text-base);
    }
    
    .topic-card p {
      font-size: 0.85rem;
      color: #666;
      margin: 0;
      line-height: 1.4;
    }
    
    /* What Are You Working On Section */
    .working-on-section {
      max-width: 1000px;
      margin: 0 auto 60px;
      padding: 0 20px;
    }
    
    .working-on-section h2 {
      font-size: 1.5rem;
      font-weight: 600;
      text-align: center;
      margin-bottom: 28px;
      color: var(--pst-color-text-base);
    }
    
    .use-case-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
    }
    
    .use-case-card {
      border-radius: 16px;
      overflow: hidden;
      background: var(--color-dropdown-background, #fff);
      border: 1px solid var(--pst-border-color);
      text-decoration: none !important;
      transition: transform 0.2s, box-shadow 0.2s;
      display: block;
    }
    
    .use-case-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }
    
    .use-case-image {
      width: 100%;
      height: 160px;
      object-fit: cover;
      background: linear-gradient(135deg, #1a1a1a 0%, #333 100%);
      position: relative;
    }
    
    .use-case-badge {
      position: absolute;
      top: 12px;
      left: 12px;
      background: #ff6d04;
      color: #fff;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .use-case-content {
      padding: 16px 20px;
    }
    
    .use-case-card h3 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--pst-color-text-base);
    }
    
    .use-case-card p {
      font-size: 0.85rem;
      color: #666;
      margin: 0;
      line-height: 1.4;
    }
  </style>

  <!-- Hero Section -->
  <div class="docs-hero">
    <div class="docs-hero-label">FiftyOne Documentation</div>
    <h1><span class="wave">👋</span> Hi, how can we help?</h1>
    
    <!-- Search Box with Ask AI button -->
    <div class="docs-search-container">
      <svg class="docs-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <input type="text" class="docs-search-box" placeholder="Search or ask a question..." onclick="document.querySelector(.DocSearch-Button).click();" readonly>
      <button class="docs-search-ai-btn" onclick="if(window.AskAI){window.AskAI.open()}else{document.querySelector(.DocSearch-Button).click()}">ASK AI</button>
    </div>
    
    <!-- Quick Action Buttons -->
    <div class="quick-actions">
      <a href="installation/index.html" class="quick-action-btn">How do I install?</a>
      <a href="user_guide/import_datasets.html" class="quick-action-btn">Import my data</a>
      <a href="tutorials/image_embeddings.html" class="quick-action-btn">Compute embeddings</a>
      <a href="tutorials/evaluate_detections.html" class="quick-action-btn">Evaluate my model</a>
    </div>
    
    <!-- Icon Links Row - Boxy pill buttons -->
    <div class="icon-links-row">
      <a href="installation/index.html" class="icon-link-box">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        Installation
      </a>
      <a href="user_guide/import_datasets.html" class="icon-link-box">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        Import data
      </a>
      <a href="tutorials/evaluate_detections.html" class="icon-link-box">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
        Evaluate models
      </a>
      <a href="plugins/index.html" class="icon-link-box">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>
        Plugins
      </a>
    </div>
  </div>

  <!-- Popular Topics Section -->
  <div class="popular-topics">
    <h2>Popular Topics</h2>
    <div class="topics-grid">
      <a href="getting_started/index.html" class="topic-card">
        <div class="topic-card-icon">🚀</div>
        <h3>Getting Started</h3>
        <p>New here? Choose a guided learning path for your use case.</p>
      </a>
      <a href="user_guide/app.html" class="topic-card">
        <div class="topic-card-icon">🖥️</div>
        <h3>App</h3>
        <p>Explore the visual interface for browsing datasets and predictions.</p>
      </a>
      <a href="brain.html" class="topic-card">
        <div class="topic-card-icon">🧠</div>
        <h3>Brain</h3>
        <p>ML-powered insights: embeddings, uniqueness, and label mistakes.</p>
      </a>
    </div>
  </div>

  <!-- What Are You Working On Section -->
  <div class="working-on-section">
    <h2>What are you working on?</h2>
    <div class="use-case-grid">
      <a href="getting_started/medical_imaging/index.html" class="use-case-card">
        <div class="use-case-image" style="background: linear-gradient(135deg, #2d1f47 0%, #1a1a2e 100%);">
          <span class="use-case-badge">Healthcare</span>
        </div>
        <div class="use-case-content">
          <h3>Medical Imaging</h3>
          <p>Work with DICOM files, CT scans, MRIs, and volumetric medical data.</p>
        </div>
      </a>
      <a href="getting_started/self_driving/index.html" class="use-case-card">
        <div class="use-case-image" style="background: linear-gradient(135deg, #1a2f1a 0%, #0d1f0d 100%);">
          <span class="use-case-badge">Automotive</span>
        </div>
        <div class="use-case-content">
          <h3>Autonomous Vehicles</h3>
          <p>Sensor fusion, LiDAR point clouds, camera feeds, and trajectory analysis.</p>
        </div>
      </a>
      <a href="getting_started/object_detection/index.html" class="use-case-card">
        <div class="use-case-image" style="background: linear-gradient(135deg, #2f2a1a 0%, #1f1a0d 100%);">
          <span class="use-case-badge">Detection</span>
        </div>
        <div class="use-case-content">
          <h3>Object Detection</h3>
          <p>Train and evaluate object detection models with bounding boxes.</p>
        </div>
      </a>
      <a href="getting_started/threed_visual_ai/index.html" class="use-case-card">
        <div class="use-case-image" style="background: linear-gradient(135deg, #1a2a3f 0%, #0d1a2f 100%);">
          <span class="use-case-badge">3D Vision</span>
        </div>
        <div class="use-case-content">
          <h3>3D Visual AI</h3>
          <p>Point clouds, 3D meshes, and spatial computer vision workflows.</p>
        </div>
      </a>
      <a href="getting_started/model_evaluation/index.html" class="use-case-card">
        <div class="use-case-image" style="background: linear-gradient(135deg, #3f1a2a 0%, #2f0d1a 100%);">
          <span class="use-case-badge">Evaluation</span>
        </div>
        <div class="use-case-content">
          <h3>Model Evaluation</h3>
          <p>Comprehensive evaluation workflows with advanced analysis techniques.</p>
        </div>
      </a>
      <a href="tutorials/index.html" class="use-case-card">
        <div class="use-case-image" style="background: linear-gradient(135deg, #1a3f3f 0%, #0d2f2f 100%);">
          <span class="use-case-badge">Learn</span>
        </div>
        <div class="use-case-content">
          <h3>Explore Tutorials</h3>
          <p>Browse all tutorials and recipes for hands-on learning.</p>
        </div>
      </a>
    </div>
  </div>

.. toctree::
   :maxdepth: 1
   :hidden:

   Overview <self>
   FiftyOne Enterprise 🚀 <enterprise/index>
   Installation <installation/index>
   Getting Started <getting_started/index>
   Tutorials <tutorials/index>
   Recipes <recipes/index>
   Cheat Sheets <cheat_sheets/index>
   User Guide <user_guide/index>
   Dataset Zoo <dataset_zoo/index>
   Model Zoo <model_zoo/index>
   FiftyOne Brain <brain>
   Plugins <plugins/index>
   Integrations <integrations/index>
   CLI <cli/index>
   API Reference <api/fiftyone>
   Contribute <contribute/index>
   Release Notes <release-notes>
   Deprecation Notices <deprecation>
   FAQ <faq/index>
