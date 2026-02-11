import logging

import nltk
from sumy.nlp.stemmers import Stemmer
from sumy.nlp.tokenizers import Tokenizer
from sumy.parsers.plaintext import PlaintextParser
from sumy.summarizers.luhn import LuhnSummarizer
from sumy.utils import get_stop_words

# Download required NLTK data (no-op if already present)
nltk.download("punkt_tab", quiet=True)

logger = logging.getLogger(__name__)

# Minimum word count needed for meaningful extractive summarization
_MIN_WORDS_FOR_SUMMARIZATION = 50

# Sentence extraction: 1 sentence per N words of transcript
_WORDS_PER_SENTENCE = 100
_MIN_SENTENCES = 3
_MAX_SENTENCES = 30

# Maximum words allowed in the final summary
_MAX_SUMMARY_WORDS = 200

def _compute_sentence_count(word_count: int) -> int:
    """Scale sentence extraction based on transcript length."""
    count = max(_MIN_SENTENCES, word_count // _WORDS_PER_SENTENCE)
    return min(count, _MAX_SENTENCES)

class SummarizerService:
    """Generate an extractive summary from a transcript using Luhn (sumy)."""

    def __init__(self):
        self._summarizer = LuhnSummarizer(Stemmer("english"))
        self._summarizer.stop_words = get_stop_words("english")

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
            sentence_count = _compute_sentence_count(word_count)
            sentences = self._summarizer(parser.document, sentence_count)

            summary = ""
            for sentence in sentences:
                text = str(sentence).strip()
                if text and not text.endswith((".", "!", "?")):
                    text += "."
                summary += text + " "

            summary = summary.strip()

            if not summary:
                return self._trim_to_max_words(self._first_sentences(transcript, n=3))

            summary = self._trim_to_max_words(summary)

            logger.info(
                f"Summary generated: {len(summary.split())} words "
                f"from {word_count} word transcript"
            )
            return summary
        except Exception as exc:
            logger.warning(f"Luhn summarization failed, using fallback: {exc}")
            return self._trim_to_max_words(self._first_sentences(transcript, n=3))

    @staticmethod
    def _trim_to_max_words(text: str) -> str:
        """Trim text to _MAX_SUMMARY_WORDS, cutting at a sentence boundary if possible."""
        words = text.split()
        if len(words) <= _MAX_SUMMARY_WORDS:
            return text
        trimmed = " ".join(words[:_MAX_SUMMARY_WORDS])
        # Try to cut at the last sentence boundary
        last_period = trimmed.rfind(". ")
        if last_period > len(trimmed) // 2:
            trimmed = trimmed[: last_period + 1]
        else:
            trimmed = trimmed.rstrip(" ,;:") + "..."
        return trimmed

    @staticmethod
    def _first_sentences(text: str, n: int = 3) -> str:
        """Return the first n sentences as a simple fallback summary."""
        sentences = text.split(". ")
        summary = ". ".join(sentences[:n])
        if not summary.endswith("."):
            summary += "."
        return summary
