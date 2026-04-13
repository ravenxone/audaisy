from __future__ import annotations

import re
from dataclasses import dataclass


SENTENCE_BOUNDARY_PATTERN = re.compile(r"(?<=[.!?])\s+")


@dataclass(frozen=True, slots=True)
class Chunk:
    text: str


class ChunkingService:
    def __init__(self, minimum_words: int = 100, maximum_words: int = 150) -> None:
        self._minimum_words = minimum_words
        self._maximum_words = maximum_words

    def chunk_text(self, text: str) -> list[Chunk]:
        normalized_text = " ".join(text.split())
        if not normalized_text:
            return []

        if len(normalized_text.split()) <= self._maximum_words:
            return [Chunk(text=normalized_text)]

        sentences = [sentence.strip() for sentence in SENTENCE_BOUNDARY_PATTERN.split(normalized_text) if sentence.strip()]
        if len(sentences) <= 1:
            return self._chunk_without_sentences(normalized_text)

        sentence_word_counts = [len(sentence.split()) for sentence in sentences]
        chunks: list[Chunk] = []
        current_sentences: list[str] = []
        current_words = 0

        for index, sentence in enumerate(sentences):
            sentence_words = sentence_word_counts[index]
            if current_sentences and current_words + sentence_words > self._maximum_words and current_words >= self._minimum_words:
                chunks.append(Chunk(text=" ".join(current_sentences)))
                current_sentences = []
                current_words = 0

            current_sentences.append(sentence)
            current_words += sentence_words

            remaining_words = sum(sentence_word_counts[index + 1 :])
            if current_words >= self._minimum_words and self._minimum_words <= remaining_words <= self._maximum_words:
                chunks.append(Chunk(text=" ".join(current_sentences)))
                current_sentences = []
                current_words = 0

        if current_sentences:
            chunks.append(Chunk(text=" ".join(current_sentences)))

        return chunks

    def _chunk_without_sentences(self, text: str) -> list[Chunk]:
        words = text.split()
        chunks: list[Chunk] = []
        for start in range(0, len(words), self._maximum_words):
            chunk_words = words[start : start + self._maximum_words]
            chunks.append(Chunk(text=" ".join(chunk_words)))
        return chunks
