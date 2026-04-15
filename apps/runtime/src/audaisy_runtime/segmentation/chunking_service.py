from __future__ import annotations

import re
from dataclasses import dataclass

from audaisy_runtime.services.render_types import GenerationUnit, RenderBlock


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

    def chunk_blocks(self, blocks: list[RenderBlock]) -> list[GenerationUnit]:
        if not blocks:
            return []

        units: list[GenerationUnit] = []
        current_text: list[str] = []
        current_block_ids: list[str] = []
        current_words = 0
        next_order = 1

        def flush_current() -> None:
            nonlocal current_text, current_block_ids, current_words, next_order
            if not current_text:
                return
            units.append(
                GenerationUnit(
                    chapter_id=blocks[0].chapter_id,
                    order=next_order,
                    text="\n\n".join(current_text),
                    block_ids=tuple(current_block_ids),
                )
            )
            next_order += 1
            current_text = []
            current_block_ids = []
            current_words = 0

        for block in blocks:
            normalized_text = " ".join(block.text.split())
            if not normalized_text:
                continue

            if block.block_type == "heading":
                flush_current()
                units.append(
                    GenerationUnit(
                        chapter_id=block.chapter_id,
                        order=next_order,
                        text=normalized_text,
                        block_ids=(block.block_id,),
                    )
                )
                next_order += 1
                continue

            word_count = len(normalized_text.split())
            if word_count > self._maximum_words:
                flush_current()
                for chunk in self.chunk_text(normalized_text):
                    units.append(
                        GenerationUnit(
                            chapter_id=block.chapter_id,
                            order=next_order,
                            text=chunk.text,
                            block_ids=(block.block_id,),
                        )
                    )
                    next_order += 1
                continue

            if current_text and current_words + word_count > self._maximum_words:
                flush_current()

            current_text.append(normalized_text)
            current_block_ids.append(block.block_id)
            current_words += word_count
            if current_words >= self._minimum_words:
                flush_current()

        flush_current()
        return units
