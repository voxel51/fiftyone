Summary: What You've Learned
============================

.. default-role:: code

Congratulations! You've completed the Self-Driving Car Dataset Guide. Let's recap what you've accomplished and explore where you can go next.

.. _summary-step-recap:

Step-by-Step Recap
------------------

**Step 1: Loading Self-Driving Datasets**

You learned how to load complex self-driving datasets into FiftyOne, working with multi-frame video sequences, sensor metadata, and associating labels with frames. This included understanding nuScenes dataset structure, handling 3D bounding boxes, and converting them to 2D camera coordinates. You mastered the concept of grouped datasets and how to organize multi-sensor data effectively.

**Step 2: Advanced Self-Driving Techniques**

You explored advanced tools for managing and analyzing self-driving datasets, including filtering by events, syncing labels across sequences, and curating key frames. You learned how to use embeddings for semantic search, compute similarity for finding specific scenarios, and integrate with the FiftyOne Model Zoo for enhanced dataset analysis.

.. _summary-exercises:

Suggested Exercises
------------------

1. **Multi-Sensor Analysis**: Extend your dataset by adding and visualizing LIDAR point clouds using FiftyOne's 3D visualization tools. How do different sensor modalities complement each other?

2. **Temporal Sequence Analysis**: Work with longer video sequences and analyze how objects move through time. Can you identify patterns in object trajectories?

3. **Scenario-Based Filtering**: Use semantic search to find specific driving scenarios like "rainy crosswalks", "pedestrians in the road", or "traffic light changes". How does this help with dataset curation?

4. **Model Integration**: Bring in predictions from your self-driving models and evaluate them frame-by-frame or sequence-wide using FiftyOne's evaluation APIs.

5. **Custom Embeddings**: Experiment with different embedding models (CLIP, DINO, etc.) to see how they affect similarity search and visualization results.

.. _summary-resources:

Resources and Further Reading
----------------------------

* `FiftyOne Documentation <https://docs.voxel51.com/>`_

* `nuScenes Dataset Official Site <https://www.nuscenes.org/>`_

* `FiftyOne Brain Documentation <../../brain.html>`_

* `FiftyOne Model Zoo <../../user_guide/model_zoo/index.html>`_

* `SAM2 Documentation <https://github.com/facebookresearch/sam2>`_


.. _summary-next-steps:

What to Do Next
---------------

Now that you've mastered self-driving datasets with FiftyOne, here are some suggested next steps:

* **Explore 3D Visualization** - Extend your dataset by adding and visualizing LIDAR point clouds using FiftyOne's 3D visualization tools

* **Try Video Analysis** - Work with longer video sequences and analyze temporal patterns in your self-driving data

* **Build Custom Filters** - Create domain-specific filters for your particular self-driving use case (urban driving, highway scenarios, etc.)

* **Join the Community** - Connect with other FiftyOne users to share insights and learn advanced self-driving data techniques

* **Apply to Real Projects** - Use these skills on your production self-driving datasets to improve data quality and model performance


.. _summary-feedback:

We'd Love Your Feedback
-----------------------

Your feedback helps us improve FiftyOne and create better learning experiences. Please let us know:

* What aspects of this self-driving guide were most helpful?
* What could be improved or clarified?
* What self-driving-specific topics would you like to see covered in future guides?
* Any issues or bugs you encountered?

You can reach us at `support@voxel51.com` or join our `Discord community <https://community.voxel51.com>`_.

Thank you for completing the Self-Driving Car Dataset Guide! We hope you're excited to apply these multi-sensor data skills to your autonomous vehicle projects. 