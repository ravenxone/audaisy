from __future__ import annotations

from audaisy_runtime.segmentation.chunking_service import ChunkingService


def build_sentence(word: str, count: int) -> str:
    return " ".join(f"{word}{index}" for index in range(count)) + "."


def test_chunking_service_groups_text_into_roughly_target_sized_paragraphs() -> None:
    text = " ".join(
        [
            build_sentence("alpha", 24),
            build_sentence("bravo", 24),
            build_sentence("charlie", 24),
            build_sentence("delta", 24),
            build_sentence("echo", 24),
            build_sentence("foxtrot", 24),
            build_sentence("golf", 24),
            build_sentence("hotel", 24),
            build_sentence("india", 24),
            build_sentence("juliet", 24),
        ]
    )

    chunks = ChunkingService().chunk_text(text)

    assert len(chunks) == 2
    for chunk in chunks:
        word_count = len(chunk.text.split())
        assert 100 <= word_count <= 150
        assert chunk.text.endswith(".")


def test_chunking_service_keeps_short_text_as_single_generation_unit() -> None:
    text = build_sentence("small", 28)

    chunks = ChunkingService().chunk_text(text)

    assert [chunk.text for chunk in chunks] == [text]
