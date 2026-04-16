from __future__ import annotations

import wave
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from audaisy_runtime.contracts.models import ApiErrorCode
from audaisy_runtime.errors import RenderPipelineError


def create_project(client: TestClient) -> dict[str, object]:
    response = client.post("/projects", json={"title": "Book"})
    assert response.status_code == 201
    return response.json()


def create_long_chapter(client: TestClient, project_id: str) -> str:
    paragraph_one = " ".join(f"alpha{i}" for i in range(60)) + "."
    paragraph_two = " ".join(f"bravo{i}" for i in range(55)) + "."
    paragraph_three = " ".join(f"charlie{i}" for i in range(30)) + "."
    import_response = client.post(
        f"/projects/{project_id}/imports",
        files={
            "file": (
                "chapter.md",
                f"# Chapter One\n\n{paragraph_one}\n\n{paragraph_two}\n\n{paragraph_three}\n".encode(),
                "text/markdown",
            )
        },
    )
    assert import_response.status_code == 201
    return client.get(f"/projects/{project_id}").json()["chapters"][0]["id"]


def write_test_wav(output_path: Path, *, frames: int = 2400) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output_path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(24000)
        handle.writeframes(b"\x00\x00" * frames)


def test_render_job_creation_blocks_when_model_is_unready(make_client) -> None:
    with make_client() as client:
        project = create_project(client)
        chapter_id = create_long_chapter(client, project["id"])
        response = client.post(
            f"/projects/{project['id']}/render-jobs",
            json={"chapterId": chapter_id},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == ApiErrorCode.MODEL_NOT_READY


def test_render_job_lifecycle_persists_segments_and_final_wav(make_app, read_db, runtime_settings) -> None:
    app = make_app
    container = app.state.container
    container.model_service.require_ready_weights_dir = lambda: runtime_settings.app_data_root / "fake-weights"  # type: ignore[method-assign]
    container.model_service.load_reference = lambda reference_path, audio_text=None: {"referencePath": str(reference_path)}  # type: ignore[method-assign]
    container.model_service.generate = lambda text, reference: SimpleNamespace(audio=b"generated")  # type: ignore[method-assign]
    container.model_service.save_wav = lambda audio, output_path: write_test_wav(output_path)  # type: ignore[method-assign]

    with TestClient(app) as client:
        project = create_project(client)
        chapter_id = create_long_chapter(client, project["id"])
        create_response = client.post(
            f"/projects/{project['id']}/render-jobs",
            json={"chapterId": chapter_id},
        )
        job_id = create_response.json()["id"]
        detail_response = client.get(f"/projects/{project['id']}/render-jobs/{job_id}")
        list_response = client.get(f"/projects/{project['id']}/render-jobs")

    assert create_response.status_code == 201
    assert create_response.json()["status"] == "queued"
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["status"] == "completed"
    assert detail["hasAudio"] is True
    assert detail["audioArtifactId"]
    assert "outputAudioPath" not in detail
    assert [segment["status"] for segment in detail["segmentSummaries"]] == ["completed", "completed", "completed"]
    assert all(segment["audioArtifactId"] for segment in detail["segmentSummaries"])
    assert all("audioPath" not in segment for segment in detail["segmentSummaries"])
    assert all("text" not in segment for segment in detail["segmentSummaries"])
    assert list_response.json()["jobs"][0]["id"] == job_id

    job_row = read_db(
        "SELECT status, output_audio_artifact_id, output_audio_path, source_chapter_revision FROM render_jobs WHERE id = ?",
        (job_id,),
    )[0]
    assert job_row["status"] == "completed"
    assert job_row["output_audio_artifact_id"]
    assert job_row["source_chapter_revision"] == 1
    final_path = runtime_settings.app_data_root / job_row["output_audio_path"]
    assert final_path.is_file()

    segment_rows = read_db(
        """
        SELECT status, audio_artifact_id, audio_path, error_code, error_message
        FROM segments
        WHERE render_job_id = ?
        ORDER BY segment_order ASC
        """,
        (job_id,),
    )
    assert len(segment_rows) == 3
    assert all(row["status"] == "completed" for row in segment_rows)
    assert all(row["audio_artifact_id"] for row in segment_rows)
    assert all((runtime_settings.app_data_root / row["audio_path"]).is_file() for row in segment_rows)
    assert all(row["error_code"] is None for row in segment_rows)
    assert all(row["error_message"] is None for row in segment_rows)

    audio_response = client.get(f"/projects/{project['id']}/render-jobs/{job_id}/audio")
    assert audio_response.status_code == 200
    assert audio_response.headers["content-type"].startswith("audio/wav")
    assert audio_response.content[:4] == b"RIFF"


def test_render_job_failure_is_persisted_truthfully(make_app, read_db, runtime_settings) -> None:
    app = make_app
    container = app.state.container
    container.model_service.require_ready_weights_dir = lambda: runtime_settings.app_data_root / "fake-weights"  # type: ignore[method-assign]
    container.model_service.load_reference = lambda reference_path, audio_text=None: {"referencePath": str(reference_path)}  # type: ignore[method-assign]

    def fail_generation(text, reference):
        raise RenderPipelineError(
            api_error_code=ApiErrorCode.RENDER_GENERATION_FAILED,
            failure_code="RENDER_GENERATION_FAILED",
            message="boom",
        )

    container.model_service.generate = fail_generation  # type: ignore[method-assign]
    container.model_service.save_wav = lambda audio, output_path: write_test_wav(output_path)  # type: ignore[method-assign]

    with TestClient(app) as client:
        project = create_project(client)
        chapter_id = create_long_chapter(client, project["id"])
        create_response = client.post(
            f"/projects/{project['id']}/render-jobs",
            json={"chapterId": chapter_id},
        )
        job_id = create_response.json()["id"]
        detail_response = client.get(f"/projects/{project['id']}/render-jobs/{job_id}")

    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["status"] == "failed"
    assert detail["hasAudio"] is False
    assert detail["audioArtifactId"] is None
    assert detail["errorCode"] == "RENDER_GENERATION_FAILED"
    assert detail["segmentSummaries"][0]["status"] == "failed"
    assert detail["segmentSummaries"][0]["errorCode"] == "RENDER_GENERATION_FAILED"

    job_row = read_db(
        "SELECT status, error_code, output_audio_path FROM render_jobs WHERE id = ?",
        (job_id,),
    )[0]
    assert job_row["status"] == "failed"
    assert job_row["error_code"] == "RENDER_GENERATION_FAILED"
    assert job_row["output_audio_path"] is None


def test_render_job_audio_is_blocked_until_completed(make_app, runtime_settings) -> None:
    app = make_app
    container = app.state.container
    container.model_service.require_ready_weights_dir = lambda: runtime_settings.app_data_root / "fake-weights"  # type: ignore[method-assign]
    container.model_service.load_reference = lambda reference_path, audio_text=None: {"referencePath": str(reference_path)}  # type: ignore[method-assign]
    container.model_service.generate = lambda text, reference: SimpleNamespace(audio=b"generated")  # type: ignore[method-assign]
    container.model_service.save_wav = lambda audio, output_path: write_test_wav(output_path)  # type: ignore[method-assign]
    container.render_service.run_queued_jobs = lambda: None  # type: ignore[method-assign]

    with TestClient(app) as client:
        project = create_project(client)
        chapter_id = create_long_chapter(client, project["id"])
        create_response = client.post(
            f"/projects/{project['id']}/render-jobs",
            json={"chapterId": chapter_id},
        )
        job_id = create_response.json()["id"]
        audio_response = client.get(f"/projects/{project['id']}/render-jobs/{job_id}/audio")

    assert create_response.status_code == 201
    assert audio_response.status_code == 409
    assert audio_response.json()["error"]["code"] == ApiErrorCode.RENDER_JOB_NOT_READY
