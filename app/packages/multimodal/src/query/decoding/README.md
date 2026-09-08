# decoding

Decoding is the query service for decoded results. It coordinates requests,
deduplicates concurrent work, and caches outcomes while delegating the actual
payload-to-IR transformation to a decoder.

This domain owns request lifecycle, not bitstream mechanics, decoder
registration, format interpretation, playback policy, or rendering.
