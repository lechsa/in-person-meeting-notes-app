import logging

logger = logging.getLogger(__name__)


class SummarizerService:
    """Generate a summary from a transcript."""

    async def summarize(self, transcript: str) -> str:
        """
        Generate summary from transcript.

        MVP: Returns the first 3 sentences as a summary.
        Production: Integrate LLM (OpenAI GPT, Claude, etc.)
        """
        if not transcript.strip():
            return "No transcript available."

        sentences = transcript.split(". ")
        summary = ". ".join(sentences[:3])
        if not summary.endswith("."):
            summary += "."

        logger.info(
            f"Summary generated: {len(summary)} chars "
            f"from {len(transcript)} char transcript"
        )
        return summary
