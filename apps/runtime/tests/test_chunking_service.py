from __future__ import annotations

from audaisy_runtime.segmentation.chunking_service import ChunkingService
from audaisy_runtime.services.render_types import RenderBlock


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


def test_chunking_service_groups_render_blocks_into_ordered_generation_units() -> None:
    blocks = [
        RenderBlock(
            chapter_id="chapter-1",
            block_id="heading-1",
            block_type="heading",
            text="Chapter One",
            order=1,
        ),
        RenderBlock(
            chapter_id="chapter-1",
            block_id="paragraph-1",
            block_type="paragraph",
            text=build_sentence("alpha", 60),
            order=2,
        ),
        RenderBlock(
            chapter_id="chapter-1",
            block_id="paragraph-2",
            block_type="paragraph",
            text=build_sentence("bravo", 55),
            order=3,
        ),
        RenderBlock(
            chapter_id="chapter-1",
            block_id="paragraph-3",
            block_type="paragraph",
            text=build_sentence("charlie", 30),
            order=4,
        ),
    ]

    units = ChunkingService().chunk_blocks(blocks)

    assert [unit.order for unit in units] == [1, 2, 3]
    assert units[0].text == "Chapter One"
    assert units[0].block_ids == ("heading-1",)
    assert units[1].block_ids == ("paragraph-1", "paragraph-2")
    assert 100 <= len(units[1].text.replace("\n\n", " ").split()) <= 150
    assert units[2].block_ids == ("paragraph-3",)
