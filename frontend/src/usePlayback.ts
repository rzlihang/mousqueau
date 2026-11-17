import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import * as Editor from "../bindings/mousqueau/editorservice";
import { errorText, useT } from "./i18n";
import { useAntApp } from "./icons";

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Playback of the project's media: the video element, where it is, whether
// it is playing and how fast. The viewer draws the element with `videoProps`;
// the timeline, the transport and the keyboard commands use the rest.
export function usePlayback(mediaUrl: string) {
  const { message } = useAntApp();
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [hasVideo, setHasVideo] = useState(true);

  // Other media starts stopped, with nothing known about it yet.
  useEffect(() => {
    setMediaDuration(0);
    setHasVideo(true);
    setPlaying(false);
  }, [mediaUrl]);
  // Follow the playhead smoothly while playing; timeupdate alone is too coarse.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (video.current) setPlayhead(video.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  // A web view's video does not keep the display awake, so Go holds it
  // while playing; failing to only means the screen saver may start.
  useEffect(() => {
    void Editor.KeepAwake(playing).catch(() => undefined);
  }, [playing]);

  function seek(time: number) {
    if (video.current) video.current.currentTime = time;
    setPlayhead(time);
  }
  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch((e) => message.error(errorText(e)));
    else v.pause();
  }
  function setSpeed(value: number) {
    setRate(value);
    if (video.current) video.current.playbackRate = value;
  }
  // One step up or down the list of speeds; false at either end.
  function stepRate(delta: number) {
    const next = RATES[RATES.indexOf(rate) + delta];
    if (next === undefined) return false;
    setSpeed(next);
  }

  return {
    mediaUrl,
    video,
    playhead,
    playing,
    rate,
    // Zero until the media's metadata has loaded.
    mediaDuration,
    // False for audio, which has no picture to show.
    hasVideo,
    seek,
    togglePlay,
    pause: () => void video.current?.pause(),
    setSpeed,
    stepRate,
    videoProps: {
      ref: video,
      src: mediaUrl,
      onClick: togglePlay,
      onLoadedMetadata: (e: SyntheticEvent<HTMLVideoElement>) => {
        const v = e.currentTarget;
        setMediaDuration(Number.isFinite(v.duration) ? v.duration : 0);
        setHasVideo(v.videoWidth > 0);
        v.playbackRate = rate;
      },
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onSeeked: (e: SyntheticEvent<HTMLVideoElement>) =>
        setPlayhead(e.currentTarget.currentTime),
      onTimeUpdate: (e: SyntheticEvent<HTMLVideoElement>) => {
        if (!playing) setPlayhead(e.currentTarget.currentTime);
      },
      onError: () => {
        // A media error can stop playback without a pause event.
        setPlaying(false);
        void message.error(t.viewer.mediaError);
      },
    },
  };
}
export type Playback = ReturnType<typeof usePlayback>;
