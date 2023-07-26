
.. # hard line break macro for HTML
.. |br| raw:: html

   <br />

.. |Dataset| replace:: :class:`Dataset <fiftyone.core.dataset.Dataset>`

.. |SampleCollection| replace:: :class:`SampleCollection <fiftyone.core.collections.SampleCollection>`

.. |DatasetView| replace:: :class:`DatasetView <fiftyone.core.view.DatasetView>`
.. |ViewStage| replace:: :class:`ViewStage <fiftyone.core.stages.ViewStage>`

.. |ToPatches| replace:: :class:`ToPatches <fiftyone.core.stages.ToPatches>`
.. |ToEvaluationPatches| replace:: :class:`ToEvaluationPatches <fiftyone.core.stages.ToEvaluationPatches>`
.. |ToClips| replace:: :class:`ToClips <fiftyone.core.stages.ToClips>`
.. |SortBySimilarity| replace:: :class:`SortBySimilarity <fiftyone.core.stages.SortBySimilarity>`

.. |Document| replace:: :class:`Document <fiftyone.core.document.Document>`

.. |Sample| replace:: :class:`Sample <fiftyone.core.sample.Sample>`
.. |SampleView| replace:: :class:`SampleView <fiftyone.core.sample.SampleView>`

.. |Frame| replace:: :class:`Frame <fiftyone.core.frame.Frame>`

.. |Group| replace:: :class:`Group <fiftyone.core.groups.Group>`

.. |Field| replace:: :class:`Field <fiftyone.core.fields.Field>`
.. |BooleanField| replace:: :class:`BooleanField <fiftyone.core.fields.BooleanField>`
.. |IntField| replace:: :class:`IntField <fiftyone.core.fields.IntField>`
.. |FloatField| replace:: :class:`FloatField <fiftyone.core.fields.FloatField>`
.. |StringField| replace:: :class:`StringField <fiftyone.core.fields.StringField>`
.. |DateField| replace:: :class:`DateField <fiftyone.core.fields.DateField>`
.. |DateTimeField| replace:: :class:`DateTimeField <fiftyone.core.fields.DateTimeField>`
.. |ListField| replace:: :class:`ListField <fiftyone.core.fields.ListField>`
.. |DictField| replace:: :class:`DictField <fiftyone.core.fields.DictField>`
.. |VectorField| replace:: :class:`VectorField <fiftyone.core.fields.VectorField>`
.. |ArrayField| replace:: :class:`ArrayField <fiftyone.core.fields.ArrayField>`
.. |GroupField| replace:: :class:`GroupField <fiftyone.core.fields.GroupField>`

.. |ViewExpression| replace:: :class:`ViewExpression <fiftyone.core.expressions.ViewExpression>`
.. |ViewField| replace:: :class:`ViewField <fiftyone.core.expressions.ViewField>`

.. |Label| replace:: :class:`Label <fiftyone.core.labels.Label>`
.. |Regression| replace:: :class:`Regression <fiftyone.core.labels.Regression>`
.. |Classification| replace:: :class:`Classification <fiftyone.core.labels.Classification>`
.. |Classifications| replace:: :class:`Classifications <fiftyone.core.labels.Classifications>`
.. |Detection| replace:: :class:`Detection <fiftyone.core.labels.Detection>`
.. |Detections| replace:: :class:`Detections <fiftyone.core.labels.Detections>`
.. |Polyline| replace:: :class:`Polyline <fiftyone.core.labels.Polyline>`
.. |Polylines| replace:: :class:`Polylines <fiftyone.core.labels.Polylines>`
.. |Keypoint| replace:: :class:`Keypoint <fiftyone.core.labels.Keypoint>`
.. |Keypoints| replace:: :class:`Keypoints <fiftyone.core.labels.Keypoints>`
.. |Segmentation| replace:: :class:`Segmentation <fiftyone.core.labels.Segmentation>`
.. |Heatmap| replace:: :class:`Heatmap <fiftyone.core.labels.Heatmap>`
.. |TemporalDetection| replace:: :class:`TemporalDetection <fiftyone.core.labels.TemporalDetection>`
.. |TemporalDetections| replace:: :class:`TemporalDetections <fiftyone.core.labels.TemporalDetections>`
.. |GeoLocation| replace:: :class:`GeoLocation <fiftyone.core.labels.GeoLocation>`
.. |GeoLocations| replace:: :class:`GeoLocations <fiftyone.core.labels.GeoLocations>`

.. |Attribute| replace:: :class:`Attribute <fiftyone.core.labels.Attribute>`
.. |BooleanAttribute| replace:: :class:`BooleanAttribute <fiftyone.core.labels.BooleanAttribute>`
.. |CategoricalAttribute| replace:: :class:`CategoricalAttribute <fiftyone.core.labels.CategoricalAttribute>`
.. |NumericAttribute| replace:: :class:`NumericAttribute <fiftyone.core.labels.NumericAttribute>`

.. |DatasetAppConfig| replace:: :class:`DatasetAppConfig <fiftyone.core.odm.dataset.DatasetAppConfig>`
.. |KeypointSkeleton| replace:: :class:`KeypointSkeleton <fiftyone.core.odm.dataset.KeypointSkeleton>`
.. |ColorScheme| replace:: :class:`ColorScheme <fiftyone.core.odm.dataset.ColorScheme>`

.. |tags| replace:: :class:`tags <fiftyone.core.sample.Sample>`
.. |Tags| replace:: :class:`Tags <fiftyone.core.sample.Sample>`

.. |DatasetImporter| replace:: :class:`DatasetImporter <fiftyone.utils.data.importers.DatasetImporter>`
.. |UnlabeledImageDatasetImporter| replace:: :class:`UnlabeledImageDatasetImporter <fiftyone.utils.data.importers.UnlabeledImageDatasetImporter>`
.. |LabeledImageDatasetImporter| replace:: :class:`LabeledImageDatasetImporter <fiftyone.utils.data.importers.LabeledImageDatasetImporter>`
.. |UnlabeledVideoDatasetImporter| replace:: :class:`UnlabeledVideoDatasetImporter <fiftyone.utils.data.importers.UnlabeledVideoDatasetImporter>`
.. |LabeledVideoDatasetImporter| replace:: :class:`LabeledVideoDatasetImporter <fiftyone.utils.data.importers.LabeledVideoDatasetImporter>`
.. |GroupDatasetImporter| replace:: :class:`GroupDatasetImporter <fiftyone.utils.data.importers.GroupDatasetImporter>`

.. |DatasetExporter| replace:: :class:`DatasetExporter <fiftyone.utils.data.exporters.DatasetExporter>`
.. |UnlabeledImageDatasetExporter| replace:: :class:`UnlabeledImageDatasetExporter <fiftyone.utils.data.exporters.UnlabeledImageDatasetExporter>`
.. |LabeledImageDatasetExporter| replace:: :class:`LabeledImageDatasetExporter <fiftyone.utils.data.exporters.LabeledImageDatasetExporter>`
.. |UnlabeledVideoDatasetExporter| replace:: :class:`UnlabeledVideoDatasetExporter <fiftyone.utils.data.exporters.UnlabeledVideoDatasetExporter>`
.. |LabeledVideoDatasetExporter| replace:: :class:`LabeledVideoDatasetExporter <fiftyone.utils.data.exporters.LabeledVideoDatasetExporter>`
.. |GroupDatasetExporter| replace:: :class:`GroupDatasetExporter <fiftyone.utils.data.exporters.GroupDatasetExporter>`

.. |SampleParser| replace:: :class:`SampleParser <fiftyone.utils.data.parsers.SampleParser>`
.. |UnlabeledImageSampleParser| replace:: :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`
.. |LabeledImageSampleParser| replace:: :class:`LabeledImageSampleParser <fiftyone.utils.data.parsers.LabeledImageSampleParser>`
.. |UnlabeledVideoSampleParser| replace:: :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`
.. |LabeledVideoSampleParser| replace:: :class:`LabeledVideoSampleParser <fiftyone.utils.data.parsers.LabeledVideoSampleParser>`

.. |DatasetType| replace:: :class:`Dataset <fiftyone.types.Dataset>`
.. |UnlabeledImageDatasetType| replace:: :class:`UnlabeledImageDataset <fiftyone.types.UnlabeledImageDataset>`
.. |LabeledImageDatasetType| replace:: :class:`LabeledImageDataset <fiftyone.types.LabeledImageDataset>`
.. |UnlabeledVideoDatasetType| replace:: :class:`UnlabeledVideoDataset <fiftyone.types.UnlabeledVideoDataset>`
.. |LabeledVideoDatasetType| replace:: :class:`LabeledVideoDataset <fiftyone.types.LabeledVideoDataset>`
.. |GroupDatasetType| replace:: :class:`GroupDataset <fiftyone.types.GroupDataset>`

.. |Metadata| replace:: :class:`Metadata <fiftyone.core.metadata.Metadata>`
.. |ImageMetadata| replace:: :class:`ImageMetadata <fiftyone.core.metadata.ImageMetadata>`
.. |VideoMetadata| replace:: :class:`VideoMetadata <fiftyone.core.metadata.VideoMetadata>`

.. |AppConfig| replace:: :class:`AppConfig <fiftyone.core.config.AppConfig>`

.. |Session| replace:: :class:`Session <fiftyone.core.session.Session>`

.. |Aggregation| replace:: :class:`Aggregation <fiftyone.core.aggregations.Aggregation>`

.. |Model| replace:: :class:`Model <fiftyone.core.models.Model>`
.. |ModelConfig| replace:: :class:`ModelConfig <fiftyone.core.models.ModelConfig>`

.. |LogitsMixin| replace:: :class:`LogitsMixin <fiftyone.core.models.LogitsMixin>`
.. |EmbeddingsMixin| replace:: :class:`EmbeddingsMixin <fiftyone.core.models.EmbeddingsMixin>`
.. |TorchModelMixin| replace:: :class:`TorchModelMixin <fiftyone.core.models.TorchModelMixin>`

.. |AnnotationResults| replace:: :class:`AnnotationResults <fiftyone.core.annotation.AnnotationResults>`
.. |BrainResults| replace:: :class:`BrainResults <fiftyone.core.brain.BrainResults>`
.. |EvaluationResults| replace:: :class:`EvaluationResults <fiftyone.core.evaluation.EvaluationResults>`

.. |SimilarityConfig| replace:: :class:`SimilarityConfig <fiftyone.brain.similarity.SimilarityConfig>`
.. |SimilarityIndex| replace:: :class:`SimilarityIndex <fiftyone.brain.similarity.SimilarityIndex>`

.. |VisualizationConfig| replace:: :class:`VisualizationConfig <fiftyone.brain.visualization.VisualizationConfig>`
.. |VisualizationResults| replace:: :class:`VisualizationResults <fiftyone.brain.visualization.VisualizationResults>`

.. |RegressionResults| replace:: :class:`RegressionResults <fiftyone.utils.eval.regression.RegressionResults>`
.. |ClassificationResults| replace:: :class:`ClassificationResults <fiftyone.utils.eval.classification.ClassificationResults>`
.. |BinaryClassificationResults| replace:: :class:`BinaryClassificationResults <fiftyone.utils.eval.classification.BinaryClassificationResults>`
.. |DetectionResults| replace:: :class:`DetectionResults <fiftyone.utils.eval.detection.DetectionResults>`
.. |SegmentationResults| replace:: :class:`SegmentationResults <fiftyone.utils.eval.segmentation.SegmentationResults>`
.. |COCOEvaluationConfig| replace:: :class:`COCOEvaluationConfig <fiftyone.utils.eval.coco.COCOEvaluationConfig>`
.. |OpenImagesEvaluationConfig| replace:: :class:`OpenImagesEvaluationConfig <fiftyone.utils.eval.openimages.OpenImagesEvaluationConfig>`
.. |ActivityNetEvaluationConfig| replace:: :class:`ActivityNetEvaluationConfig <fiftyone.utils.eval.activitynet.ActivityNetEvaluationConfig>`

.. |Plot| replace:: :class:`Plot <fiftyone.core.plots.base.Plot>`
.. |ResponsivePlot| replace:: :class:`ResponsivePlot <fiftyone.core.plots.base.ResponsivePlot>`
.. |ViewPlot| replace:: :class:`ViewPlot <fiftyone.core.plots.base.ViewPlot>`
.. |InteractivePlot| replace:: :class:`InteractivePlot <fiftyone.core.plots.base.InteractivePlot>`
.. |PlotManager| replace:: :class:`Plot <fiftyone.core.plots.manager.PlotManager>`

.. |CategoricalHistogram| replace:: :class:`CategoricalHistogram <fiftyone.core.plots.views.CategoricalHistogram>`
.. |NumericalHistogram| replace:: :class:`NumericalHistogram <fiftyone.core.plots.views.NumericalHistogram>`
.. |ViewGrid| replace:: :class:`ViewGrid <fiftyone.core.plots.views.ViewGrid>`

.. |InteractiveScatter| replace:: :class:`InteractiveScatter <fiftyone.core.plots.plotly.InteractiveScatter>`
.. |InteractiveHeatmap| replace:: :class:`InteractiveHeatmap <fiftyone.core.plots.plotly.InteractiveHeatmap>`

.. |AnnotationBackend| replace:: :class:`AnnotationBackend <fiftyone.utils.annotations.AnnotationBackend>`
.. |AnnotationBackendConfig| replace:: :class:`AnnotationBackendConfig <fiftyone.utils.annotations.AnnotationBackendConfig>`

.. |EmbeddedDocument| replace:: :class:`EmbeddedDocument <fiftyone.core.odm.embedded_document.EmbeddedDocument>`
.. |DynamicEmbeddedDocument| replace:: :class:`DynamicEmbeddedDocument <fiftyone.core.odm.embedded_document.DynamicEmbeddedDocument>`

.. |Space| replace:: :class:`Space <fiftyone.core.spaces.Space>`
.. |Panel| replace:: :class:`Panel <fiftyone.core.spaces.Panel>`

.. |OrthographicProjectionMetadata| replace:: :class:`OrthographicProjectionMetadata <fiftyone.utils.utils3d.OrthographicProjectionMetadata>`
