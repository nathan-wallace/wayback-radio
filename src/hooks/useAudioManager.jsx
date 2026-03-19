// useAudioManager.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl, Howler } from 'howler';

const FADE_DURATION_MS = 500;

Howler.html5PoolSize = Math.max(Howler.html5PoolSize || 10, 20);

function inferFormatFromMimeType(mimeType = '') {
  const normalized = String(mimeType).toLowerCase();
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('aac')) return 'aac';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('flac')) return 'flac';
  return null;
}

function inferFormatFromUrl(url = '') {
  const normalized = String(url).toLowerCase();
  if (normalized.match(/\.mp3($|[?#])/)) return 'mp3';
  if (normalized.match(/\.m4a($|[?#])/)) return 'mp4';
  if (normalized.match(/\.mp4($|[?#])/)) return 'mp4';
  if (normalized.match(/\.aac($|[?#])/)) return 'aac';
  if (normalized.match(/\.ogg($|[?#])/)) return 'ogg';
  if (normalized.match(/\.wav($|[?#])/)) return 'wav';
  if (normalized.match(/\.flac($|[?#])/)) return 'flac';
  return null;
}

function choosePlayablePlayback(playback) {
  if (!playback) return null;

  const candidateStreams = [
    playback.primaryUrl ? { url: playback.primaryUrl, mimeType: playback.mimeType || null } : null,
    ...(Array.isArray(playback.streams) ? playback.streams : [])
  ].filter((stream) => stream?.url);

  const dedupedStreams = [...new Map(
    candidateStreams.map((stream) => [stream.url, stream])
  ).values()];

  if (!dedupedStreams.length) {
    return null;
  }

  const formats = [...new Set(dedupedStreams.map((stream) => (
    inferFormatFromMimeType(stream.mimeType) || inferFormatFromUrl(stream.url)
  )).filter(Boolean))];

  return {
    src: dedupedStreams.map((stream) => stream.url),
    format: formats.length ? formats : undefined,
  };
}

export const useAudioManager = (playback, isOn, volume) => {
  const [sound, setSound] = useState(null);
  const [transportState, setTransportState] = useState('paused');
  const pauseTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const isOnRef = useRef(isOn);
  const volumeRef = useRef(volume);
  const activeSoundRef = useRef(null);

  const clearPendingTimers = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isOnRef.current = isOn;
  }, [isOn]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    const playablePlayback = choosePlayablePlayback(playback);

    if (!playablePlayback?.src?.length) {
      activeSoundRef.current = null;
      setSound(null);
      setTransportState('paused');
      clearPendingTimers();
      return undefined;
    }

    clearPendingTimers();
    setTransportState('paused');

    const newSound = new Howl({
      src: playablePlayback.src,
      autoplay: false,
      html5: true,
      volume: 0,
      format: playablePlayback.format,
      onplay: () => {
        if (activeSoundRef.current !== newSound) {
          return;
        }

        clearPendingTimers();

        if (!isOnRef.current) {
          newSound.pause();
          setTransportState('paused');
          return;
        }

        newSound.fade(0, volumeRef.current, FADE_DURATION_MS);
        fadeTimerRef.current = setTimeout(() => {
          fadeTimerRef.current = null;
        }, FADE_DURATION_MS);
        setTransportState('playing');
      },
      onpause: () => {
        if (activeSoundRef.current !== newSound) {
          return;
        }

        clearPendingTimers();
        setTransportState('paused');
      },
      onstop: () => {
        if (activeSoundRef.current !== newSound) {
          return;
        }

        clearPendingTimers();
        setTransportState('paused');
      },
      onplayerror: () => {
        if (activeSoundRef.current !== newSound) {
          return;
        }

        clearPendingTimers();
        setTransportState('paused');
      },
      onloaderror: () => {
        if (activeSoundRef.current !== newSound) {
          return;
        }

        clearPendingTimers();
        setTransportState('paused');
      }
    });

    activeSoundRef.current = newSound;
    setSound(newSound);

    return () => {
      if (activeSoundRef.current === newSound) {
        activeSoundRef.current = null;
      }
      clearPendingTimers();
      newSound.stop();
      newSound.unload();
      setTransportState('paused');
    };
  }, [clearPendingTimers, playback]);

  useEffect(() => {
    if (!sound) {
      return undefined;
    }

    clearPendingTimers();

    if (isOn) {
      if (!sound.playing()) {
        setTransportState('buffering');
        sound.play();
      } else {
        sound.fade(sound.volume(), volume, FADE_DURATION_MS);
        fadeTimerRef.current = setTimeout(() => {
          fadeTimerRef.current = null;
        }, FADE_DURATION_MS);
        setTransportState('playing');
      }
    } else {
      const startVolume = sound.volume();
      sound.fade(startVolume, 0, FADE_DURATION_MS);
      fadeTimerRef.current = setTimeout(() => {
        fadeTimerRef.current = null;
      }, FADE_DURATION_MS);
      pauseTimerRef.current = setTimeout(() => {
        pauseTimerRef.current = null;
        if (sound.playing()) {
          sound.pause();
        } else {
          setTransportState('paused');
        }
      }, FADE_DURATION_MS);
    }

    return () => {
      clearPendingTimers();
    };
  }, [clearPendingTimers, isOn, sound, volume]);

  useEffect(() => {
    if (sound && transportState === 'playing') {
      sound.volume(volume);
    }
  }, [transportState, volume, sound]);

  return { sound, transportState };
};
