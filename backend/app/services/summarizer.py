import logging

from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.text_rank import TextRankSummarizer

logger = logging.getLogger(__name__)

# Minimum word count needed for meaningful extractive summarization
_MIN_WORDS_FOR_SUMMARIZATION = 50

# Number of sentences to extract for the summary
_SUMMARY_SENTENCE_COUNT = 5


class SummarizerService:
    """Generate an extractive summary from a transcript using TextRank (sumy)."""

    def __init__(self):
        self._summarizer = TextRankSummarizer()

    async def summarize(self, transcript: str) -> str:
        """
        Generate summary from transcript using TextRank algorithm.

        Falls back to returning the first 3 sentences if the transcript
        is too short for extractive summarization.
        """
        if not transcript.strip():
            return "No transcript available."

        word_count = len(transcript.split())

        if word_count < _MIN_WORDS_FOR_SUMMARIZATION:
            return self._first_sentences(transcript, n=3)

        try:
            parser = PlaintextParser.from_string(transcript, Tokenizer("english"))
            sentences = self._summarizer(parser.document, _SUMMARY_SENTENCE_COUNT)
            summary = " ".join(str(s) for s in sentences)

            if not summary.strip():
                return self._first_sentences(transcript, n=3)

            logger.info(
                f"Summary generated: {len(summary)} chars "
                f"from {len(transcript)} char transcript"
            )
            return summary
        except Exception as exc:
            logger.warning(f"TextRank summarization failed, using fallback: {exc}")
            return self._first_sentences(transcript, n=3)

    @staticmethod
    def _first_sentences(text: str, n: int = 3) -> str:
        """Return the first n sentences as a simple fallback summary."""
        sentences = text.split(". ")
        summary = ". ".join(sentences[:n])
        if not summary.endswith("."):
            summary += "."
        return summary
