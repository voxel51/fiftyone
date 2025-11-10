.. _val_guide_summary:

Summary: What You've Learned
============================

.. default-role:: code

Congratulations! You've completed the Verified Auto-Labeling Guide. Let's recap what you've accomplished and explore where you can go next.

.. _summary-step-recap:

Step-by-Step Recap
------------------

**Step 1: Prepare Your Dataset and Delegated Operators**

You learned how to set up the foundation for Verified Auto-Labeling by preparing your dataset in FiftyOne Enterprise and configuring GPU-enabled delegated operators. This included understanding the infrastructure requirements and ensuring your environment is ready for auto labeling workflows.

**Step 2: Configure Your VAL Run**

You mastered the configuration process for a VAL run, including sample selection, model selection, class configuration, target label fields, and confidence thresholds. This step showed you how to customize the auto-labeling process to match your specific annotation needs.

**Step 3: Analyze and Approve Predictions**

You explored FiftyOne's review interface for systematically assessing auto-generated labels. This included using the Review and Approval tabs to batch select correct predictions and mark them for approval.

**Step 4: Assess Labels with Embeddings**

You used FiftyOne's patch embeddings visualization to identify outliers, false positives, and false negatives that are difficult to spot through manual review. You then tagged problematic predictions for relabeling or removal.

**Step 5: Finalize Your VAL Workflow**

You learned how to complete the VAL workflow by integrating approved labels into your dataset, discarding the rest.

.. _summary-exercises:

Suggested Exercises
------------------

1. **Custom Confidence Thresholds**: Experiment with different confidence thresholds for different classes. Which threshold values optimize the balance between automation and accuracy for your use case?

2. **Iterative Refinement**: Run multiple VAL cycles on the same dataset, using insights from embeddings to improve each iteration. Track how prediction quality improves over successive runs.

3. **Team Collaboration**: Set up a workflow where different team members review and approve labels for different object classes. How does VAL facilitate distributed annotation workflows?

4. **Integration with Training Pipelines**: Use approved VAL labels to train or fine-tune your models. Measure the impact of high-quality auto-labeled data on model performance.

.. _summary-resources:

Resources and Further Reading
----------------------------

* `FiftyOne Teams Documentation <https://docs.voxel51.com/teams/>`_

* `Delegated Operations Guide <https://docs.voxel51.com/enterprise/plugins.html#enterprise-delegated-operations>`_

* `FiftyOne Embeddings Tutorial <../../tutorials/image_embeddings.html>`_

* `Model Evaluation Guide <../model_evaluation/index.html>`_

* `FiftyOne Dataset Zoo <../../user_guide/dataset_zoo/index.html>`_

* `FiftyOne Annotation Integration <../../integrations/annotation.html>`_

* `Active Learning Workflows <../../tutorials/active_learning.html>`_

.. _summary-next-steps:

What to Do Next
---------------

Now that you've mastered Verified Auto-Labeling with FiftyOne, here are some suggested next steps:

* **Explore Segmentation VAL** - Apply VAL workflows to instance and semantic segmentation tasks

* **Build Custom Models** - Integrate your own detection or classification models into the VAL pipeline

* **Scale Your Annotation** - Use VAL to accelerate annotation on large-scale datasets with thousands of images

* **Join the Community** - Connect with other FiftyOne Teams users to share VAL best practices and advanced techniques

* **Apply to Production** - Implement VAL in your production annotation pipelines to reduce manual labeling costs and improve data quality


.. _summary-feedback:

We'd Love Your Feedback
-----------------------

Your feedback helps us improve FiftyOne and create better learning experiences. Please let us know:

* What aspects of this VAL guide were most helpful?
* What could be improved or clarified?
* What VAL-specific topics would you like to see covered in future guides?
* Any issues or bugs you encountered?

You can reach us at `support@voxel51.com` or join our `Discord community <https://community.voxel51.com>`_.

Thank you for completing the Verified Auto-Labeling Guide! We hope you're excited to apply these skills to accelerate your annotation workflows and improve your dataset quality.
