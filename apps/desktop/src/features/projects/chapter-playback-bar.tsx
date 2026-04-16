import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import type { RenderJobResponse } from "@audaisy/contracts";

import skipBackwardIcon from "@/assets/icons/go-backward-10-sec.svg";
import downloadIcon from "@/assets/icons/download-circle-01.svg";
import skipForwardIcon from "@/assets/icons/go-forward-10-sec.svg";
import playIcon from "@/assets/icons/play-circle-02.svg";
import shareIcon from "@/assets/icons/share-08.svg";
import styles from "@/features/projects/chapter-playback-bar.module.css";
import { useAudaisyClient } from "@/shared/api/client-context";

type PlaybackState = "idle" | "loading" | "playing" | "paused";

type ChapterPlaybackBarProps = {
  chapterTitle: string;
  completedRenderJob: RenderJobResponse | null;
  failureMessage: string | null;
  projectId: string;
};

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const roundedSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function clampTime(value: number, duration: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return Math.max(0, value);
  }

  return Math.min(Math.max(0, value), duration);
}

export function ChapterPlaybackBar({
  chapterTitle,
  completedRenderJob,
  failureMessage,
  projectId,
}: ChapterPlaybackBarProps) {
  const client = useAudaisyClient();
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioRequestRef = useRef<Promise<string | null> | null>(null);
  const activeJobIdRef = useRef<string | null>(completedRenderJob?.id ?? null);
  const suppressPauseRef = useRef(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  activeJobIdRef.current = completedRenderJob?.id ?? null;

  function disposeAudioSource() {
    audioRequestRef.current = null;

    const audioElement = audioElementRef.current;
    if (audioElement) {
      suppressPauseRef.current = true;
      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load();
      suppressPauseRef.current = false;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  useEffect(() => {
    disposeAudioSource();
    setPlaybackState("idle");
    setCurrentTime(0);
    setDuration(0);
    setPlaybackError(null);
  }, [completedRenderJob?.id]);

  useEffect(
    () => () => {
      disposeAudioSource();
    },
    [],
  );

  async function ensureAudioUrl() {
    if (!completedRenderJob) {
      return null;
    }

    if (audioUrlRef.current) {
      return audioUrlRef.current;
    }

    if (audioRequestRef.current) {
      return audioRequestRef.current;
    }

    const jobId = completedRenderJob.id;
    const request = client.projects
      .getRenderJobAudio(projectId, jobId)
      .then((audioBlob) => {
        const nextUrl = URL.createObjectURL(audioBlob);

        if (activeJobIdRef.current !== jobId) {
          URL.revokeObjectURL(nextUrl);
          return null;
        }

        audioUrlRef.current = nextUrl;
        return nextUrl;
      })
      .finally(() => {
        if (audioRequestRef.current === request) {
          audioRequestRef.current = null;
        }
      });

    audioRequestRef.current = request;
    return request;
  }

  async function handlePlayPause() {
    if (!completedRenderJob) {
      return;
    }

    const audioElement = audioElementRef.current;
    if (!audioElement) {
      return;
    }

    if (playbackState === "playing") {
      audioElement.pause();
      setPlaybackState("paused");
      return;
    }

    setPlaybackState("loading");
    setPlaybackError(null);

    try {
      const nextUrl = await ensureAudioUrl();
      if (!nextUrl) {
        setPlaybackState("idle");
        return;
      }

      if (audioElement.src !== nextUrl) {
        audioElement.src = nextUrl;
        audioElement.load();
      }

      await audioElement.play();
      setPlaybackState("playing");
    } catch (error) {
      setPlaybackError(error instanceof Error ? error.message : "Unable to play chapter audio.");
      setPlaybackState(audioUrlRef.current ? "paused" : "idle");
    }
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    const audioElement = audioElementRef.current;
    if (!audioElement) {
      return;
    }

    const nextTime = clampTime(Number(event.currentTarget.value), duration);
    audioElement.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleSkip(deltaSeconds: number) {
    const audioElement = audioElementRef.current;
    if (!audioElement) {
      return;
    }

    const nextTime = clampTime(audioElement.currentTime + deltaSeconds, duration);
    audioElement.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleLoadedMetadata() {
    const audioElement = audioElementRef.current;
    if (!audioElement) {
      return;
    }

    const nextDuration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
    setDuration(nextDuration);
    setCurrentTime(clampTime(audioElement.currentTime, nextDuration));
  }

  function handleTimeUpdate() {
    const audioElement = audioElementRef.current;
    if (!audioElement) {
      return;
    }

    setCurrentTime(clampTime(audioElement.currentTime, duration || audioElement.duration || 0));
  }

  function handleEnded() {
    setPlaybackState("paused");
    setCurrentTime(duration);
  }

  const scrubberProgress = duration > 0 ? `${Math.min((currentTime / duration) * 100, 100)}%` : "0%";
  const scrubberMax = duration > 0 ? duration : Math.max(currentTime, 0);
  const playButtonLabel = playbackState === "playing" ? "Pause chapter audio" : "Play chapter audio";
  const controlsDisabled = !completedRenderJob || playbackState === "loading";
  const shouldRenderPlayer = Boolean(completedRenderJob || failureMessage);
  const visibleError = failureMessage ?? playbackError;

  if (!shouldRenderPlayer) {
    return null;
  }

  if (!completedRenderJob) {
    return (
      <section className={styles.playerShell} data-testid="chapter-player">
        <div className={styles.playerAlert} role="alert">
          <span className={styles.playerAlertLabel}>Generation failed</span>
          <span className={styles.playerAlertMessage}>{visibleError}</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.playerShell} data-testid="chapter-player">
      <div className={styles.playerBar} data-state={playbackState}>
        <div className={styles.playerLead} aria-hidden="true">
          <span className={styles.playerLeadLabel}>Creation</span>
          <span className={styles.playerLeadTitle}>{chapterTitle}</span>
        </div>

        <div className={styles.playerTransport}>
          <div className={styles.playerControlRow}>
            <button
              aria-label="Go backward 10 seconds"
              className={styles.playerIconButton}
              disabled={controlsDisabled}
              onClick={() => handleSkip(-10)}
              type="button"
            >
              <img alt="" className={styles.playerIcon} src={skipBackwardIcon} />
            </button>

            <button
              aria-label={playButtonLabel}
              className={`${styles.playerIconButton} ${styles.playerPrimaryButton}`}
              disabled={controlsDisabled}
              onClick={() => void handlePlayPause()}
              type="button"
            >
              {playbackState === "playing" ? (
                <span aria-hidden="true" className={styles.pauseGlyph}>
                  <span />
                  <span />
                </span>
              ) : (
                <img alt="" className={`${styles.playerIcon} ${styles.playerPrimaryIcon}`} src={playIcon} />
              )}
            </button>

            <button
              aria-label="Go forward 10 seconds"
              className={styles.playerIconButton}
              disabled={controlsDisabled}
              onClick={() => handleSkip(10)}
              type="button"
            >
              <img alt="" className={styles.playerIcon} src={skipForwardIcon} />
            </button>
          </div>

          <div className={styles.playerTimelineRow}>
            <span className={styles.playerTime}>{formatPlaybackTime(currentTime)}</span>
            <input
              aria-label="Playback position"
              className={styles.playerScrubber}
              disabled={!completedRenderJob || scrubberMax <= 0}
              max={scrubberMax}
              min={0}
              onChange={handleSeek}
              step={0.1}
              style={{ "--player-progress": scrubberProgress } as CSSProperties}
              type="range"
              value={Math.min(currentTime, scrubberMax)}
            />
            <span className={styles.playerTime}>{formatPlaybackTime(duration)}</span>
          </div>
        </div>

        <div className={styles.playerActionRail} aria-hidden="true">
          <span className={styles.playerActionIcon}>
            <img alt="" className={styles.playerIcon} src={downloadIcon} />
          </span>
          <span className={styles.playerActionIcon}>
            <img alt="" className={styles.playerIcon} src={shareIcon} />
          </span>
        </div>

        <audio
          className="visually-hidden"
          data-testid="chapter-audio-element"
          onEnded={handleEnded}
          onLoadedMetadata={handleLoadedMetadata}
          onPause={() => {
            if (suppressPauseRef.current) {
              return;
            }
            setPlaybackState((current) => (current === "loading" ? current : "paused"));
          }}
          onTimeUpdate={handleTimeUpdate}
          ref={audioElementRef}
        />
      </div>

      {visibleError ? (
        <p className={styles.playerError} role="alert">
          {visibleError}
        </p>
      ) : null}
    </section>
  );
}
