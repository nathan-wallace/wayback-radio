// useAudioManager — improved playback with buffered audio, adaptive volume, error recovery

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Howl, Howler } from 'howler';

Howler.html5PoolSize = Math.max(Howler.html5PoolSize || 10, 20);

// ---------- helpers (kept in-file to avoid import loops in tests) ----------

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
  if (normalized.match(/\.(mp3)([?#]|$)/)) return 'mp3';
  if (normalized.match(/\.(m4a|[?#])mp4$/)) return 'mp4';
  if (normalized.match(/\.(m4a)([?#]|$)/)) return 'mp4';
  if (normalized.match(/\.(aac)([?#]|$)/)) return 'aac';
  if (normalized.match(/\.(ogg)([?#]|$)/)) return 'ogg';
  if (normalized.match(/\.(wav)([?#]|$)/)) return 'wav';
  if (normalized.match(/\.(flac)([?#]|$)/)) return 'flac';
  return null;
}

function choosePlayablePlayback(playback) {
  if (!playback) return null;
  const candidateStreams = [
    playback.primaryUrl ? { url: playback.primaryUrl, mimeType: playback.mimeType || null } : null,
    ...(Array.isArray(playback.streams) ? playback.streams : []),
  ].filter((stream) => stream?.url);

  const deduped = [...new Map(candidateStreams.map((stream) => [stream.url, stream])).values()];
  if (!deduped.length) return null;

  const formats = deduped.map((stream) => inferFormatFromMimeType(stream.mimeType) || inferFormatFromUrl(stream.url)).filter(Boolean);
  return { src: deduped.map((stream) => stream.url), format: formats.length ? formats : void 0 };
}

function isReadyStateOk(readyState) {
  // 4 = HAVE_EVERYTHING, 3 = HAVE_FUTURE_DATA (loaded enough to seek)
  return readyState >= 3;
}

// ---------- fade constants (exposed for testing) ----------
const FADE_OUT_MS = 400;
const FADE_IN_MS = 250;
const MAX_PENDING_FADES = 6;

// ---------- main hook ----------
export function useAudioManager(playback, isOn, volume) {
  const [sound, setSound] = useState(null);
  const [transportState, setTransportState] = useState('paused');
  const [transportError, setTransportError] = useState(null);
  const [audioReady, setAudioReady] = useState(false);
  const pauseTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const isOnRef = useRef(isOn);
  const volumeRef = useRef(volume);
  const activeSoundRef = useRef(null);
  const prevSoundRef = useRef(null);
  const isMountedRef = useRef(false);

  // ---------- helpers ----------
  const clearPendingTimers = useCallback(() => {
    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
  }, []);

  function fadeOutSound(src, ms, cb) {
    const sound = src instanceof Howl ? src : activeSoundRef.current;
    if (!sound) { cb(); return; }
    const startVol = Math.max(sound.volume(), 0.001);
    const actualFade = Math.min(ms, 800);
    try { sound.fade(startVol, 0, actualFade); } catch {}
    const t = setTimeout(() => {
      try { sound.stop(); sound.unload(); } catch {}
      cb();
    }, actualFade + 20);
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); }
    fadeTimerRef.current = t;
  }

  // ---------- mount tracking ----------
  useLayoutEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; clearPendingTimers(); }; }, [clearPendingTimers]);

  // ---------- ref syncs ----------
  useEffect(() => { isOnRef.current = isOn; }, [isOn]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // ---------- transport / error helpers ----------
  function markTransportError(reason, source) {
    if (!isMountedRef.current) return;
    setTransportError(reason || (source === 'playback' ? 'Playback was stopped before the audio could start.' : 'The audio stream could not be loaded.'));
  }

  // ---------- lifecycle: new playback ----------
  useEffect(() => {
    const playablePlayback = choosePlayablePlayback(playback);

    // ---- new playback received: start the new sound, fade out old ----
    if (!playablePlayback?.src?.length) {
      // no source — stop current
      activeSoundRef.current = null;
      clearPendingTimers();
      if (isMountedRef.current) { setSound(null); setTransportState('paused'); setTransportError(null); setAudioReady(false); }
      if (prevSoundRef.current) { const prev = prevSoundRef.current; prevSoundRef.current = null; try { prev.stop(); prev.unload(); } catch {} return }
      prevSoundRef.current = null;
      return undefined;
    }

    clearPendingTimers();
    // remember the old sound so we can crossfade
    const oldSound = activeSoundRef.current;
    prevSoundRef.current = oldSound;

    setTransportState('paused');
    setTransportState('buffering');
    setAudioReady(false);
    setTransportError(null);

    const newSound = new Howl({
      src: playablePlayback.src,
      autoplay: false,
      html5: true,
      volume: 0,
      format: playablePlayback.format,
      onplay: () => {
        if (activeSoundRef.current !== newSound) return;
        clearPendingTimers();
        if (isMountedRef.current) { setTransportError(null); }
        if (!isOnRef.current) { newSound.pause(); if (isMountedRef.current) setTransportState('paused'); return; }
        try { newSound.fade(0, volumeRef.current, FADE_IN_MS); } catch {}
        const t = setTimeout(() => { fadeTimerRef.current = null; }, FADE_IN_MS);
        fadeTimerRef.current = t;
        if (isMountedRef.current) setTransportState('playing');
        setAudioReady(true);
      },
      onpause: () => {
        if (activeSoundRef.current !== newSound) return;
        clearPendingTimers();
        if (isMountedRef.current) setTransportState('paused');
      },
      onstop: () => {
        if (activeSoundRef.current !== newSound) return;
        clearPendingTimers();
        if (isMountedRef.current) setTransportState('paused');
      },
      onplayerror: (_soundId, playbackError) => {
        if (activeSoundRef.current !== newSound) return;
        clearPendingTimers();
        markTransportError(playbackError, 'playback');
        if (isMountedRef.current) setTransportState('blocked');
      },
      onloaderror: (_soundId, playbackError) => {
        if (activeSoundRef.current !== newSound) return;
        clearPendingTimers();
        markTransportError(playbackError, 'load');
        if (isMountedRef.current) setTransportState('error');
        // fallback: try next source if available
        if (playablePlayback.src.length > 1) {
          const nextIdx = playablePlayback.src.indexOf(newSound._src?.[0]) + 1;
          if (nextIdx < playablePlayback.src.length) {
            // unload this and re-initialize with next source
            newSound.stop();
            const fallbackSound = new Howl({
              src: [playablePlayback.src[nextIdx]],
              autoplay: false,
              html5: true,
              volume: 0,
              format: [playablePlayback.format?.[nextIdx]],
              onplay: () => { activeSoundRef.current = fallbackSound; if (isMountedRef.current) setSound(fallbackSound); },
              onplayerror: (id2) => { if (activeSoundRef.current !== fallbackSound) return; markTransportError(playbackError, 'playback'); if (isMountedRef.current) setTransportState('blocked'); },
              onloaderror: (id2) => { if (activeSoundRef.current !== fallbackSound) return; markTransportError(playbackError, 'load'); if (isMountedRef.current) setTransportState('error'); },
            });
            activeSoundRef.current = fallbackSound;
            return;
          }
        }
      },
    });

    activeSoundRef.current = newSound;
    if (isMountedRef.current) setSound(newSound);

    // ---- crossfade cleanup -----
    if (oldSound) setTimeout(() => { if (prevSoundRef.current === oldSound && activeSoundRef.current !== oldSound) { prevSoundRef.current = null; try { oldSound.stop(); oldSound.unload(); } catch {} } }, FADE_OUT_MS + 30);

    return () => {
      if (activeSoundRef.current === newSound) activeSoundRef.current = null;
      clearPendingTimers();
      newSound.stop();
      newSound.unload();
      if (isMountedRef.current) setTransportState('paused');
      setTransportError(null);
    };
  }, [clearPendingTimers, playback]);

  // ---------- lifecycle: isOn / volume ----------
  useEffect(() => {
    if (!sound) return;
    clearPendingTimers();
    if (isOn) {
      if (!sound.playing()) {
        if (isMountedRef.current) { setTransportError(null); setTransportState('buffering'); }
        sound.play();
        // check that it actually started, then transition to playing
      } else {
        setTransportError(null);
        if (isMountedRef.current) setTransportState('playing');
      }
      if (sound.playing()) {
        try { sound.fade(sound.volume(), volume, FADE_IN_MS); } catch {}
        const t = setTimeout(() => { fadeTimerRef.current = null; }, FADE_IN_MS);
        fadeTimerRef.current = t;
      }
    } else {
      const startVolume = Math.max(sound.volume(), 0.001);
      try { sound.fade(startVolume, 0, FADE_OUT_MS); } catch {}
      const t = setTimeout(() => {
        fadeTimerRef.current = null;
        pauseTimerRef.current = setTimeout(() => {
          pauseTimerRef.current = null;
          if (sound.playing()) sound.pause();
          else if (isMountedRef.current) setTransportState('paused');
        }, FADE_OUT_MS);
      }, FADE_OUT_MS + 10);
      fadeTimerRef.current = t;
    }
    return () => clearPendingTimers();
  }, [clearPendingTimers, isOn, sound, volume]);

  // ---------- sync volume when already playing ----------
  useEffect(() => {
    if (sound && transportState === 'playing') sound.volume(volume);
  }, [transportState, volume, sound]);

  return { sound, transportState, transportError, audioReady };
}
