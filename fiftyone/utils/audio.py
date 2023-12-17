import itertools
import logging
import warnings
import os

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
from fiftyone.core.sample import Sample
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov
from fiftyone.core.odm import DynamicEmbeddedDocument
import fiftyone.utils.image as foui

np = fou.lazy_import("numpy")
sio = fou.lazy_import("scipy.io")
ss = fou.lazy_import("scipy.signal")
plt = fou.lazy_import("matplotlib.pyplot")

def wav_to_spectrogram(wav_file,output_dir):
            # Load the audio file
            sample_rate, audio_data = sio.wavfile.read(wav_file)

            # Generate a spectrogram
            frequencies, times, Sxx = ss.spectrogram(audio_data, fs=sample_rate)

            

            # Create a new directory path by joining the existing directory with the new directory name
            spectograms_path = output_dir + "/" + wav_file.split("/")[-2]

            if not os.path.exists(spectograms_path):
                os.makedirs(spectograms_path)

            # Display the spectrogram
            plt.figure()
            plt.pcolormesh(times, frequencies, 10 * np.log10(Sxx))  # Using log scale for better visualization
            plt.ylabel('Frequency [Hz]')
            plt.xlabel('Time [sec]')
            plt.title('Spectrogram')
            plt.colorbar(label='Intensity [dB]')
            image_path = output_dir + "/" + wav_file.split("/")[-2] + "/" + wav_file.split("/")[-1].split(".")[0] + ".png"
            plt.savefig(image_path)
            plt.close()
            return  image_path

class SpectogramMetadata(DynamicEmbeddedDocument, fol._HasMedia):
    """Class for storing metadata about spectograms.

    Args:
        spec_path (None): the path to the orthographic projection on disk

    """

    _MEDIA_FIELD = "spec_path"

    spec_path = fof.StringField()




def compute_spectograms(
    samples,
    output_dir,
    rel_dir=None,
    metadata_field="spectogram_metadata",
    
):
    """Computes spectograms for the audio files in the
    given collection.

    This operation will populate :class:`SpectogramMetadata`
    instances for each projection in the ``metadata_field`` of each sample.

    Examples::

        *NEED EXAMPLE*

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        size: the desired ``(width, height)`` for the generated maps. Either
            dimension can be None or negative, in which case the appropriate
            aspect-preserving value is used
        output_dir: an output directory in which to store the images/maps
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each image. This
            argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths
        metadata_field ("orthographic_projection_metadata"): the name of the
            field in which to store :class:`OrthographicProjectionMetadata`
            instances for each projection
    """


    fov.validate_collection(samples, media_type=fom.AUDIO)
    audio_view = samples

    filepaths = audio_view.values("filepath")
    groups = itertools.repeat(None)

    filename_maker = fou.UniqueFilenameMaker(
        output_dir=output_dir, rel_dir=rel_dir
    )


    all_metadata = []

    with fou.ProgressBar(total=len(filepaths)) as pb:
        for filepath, group in pb(zip(filepaths, groups)):
            

            image_path = wav_to_spectrogram(filepath, output_dir)
            metadata = SpectogramMetadata(
                 spec_path=image_path
            )

           

            all_metadata.append(metadata)



    audio_view.set_values(metadata_field, all_metadata)


