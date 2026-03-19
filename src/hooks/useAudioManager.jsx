// useAudioManager.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl, Howler } from 'howler';

const FADE_DURATION_MS = 500;

Howler.html5PoolSize = Math.max(Howler.html5PoolSize || 10, 20);

export const useAudioManager = (audioUrl, isOn, volume) => {
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
    if (!audioUrl) {
      activeSoundRef.current = null;
      setSound(null);
      setTransportState('paused');
      clearPendingTimers();
      return undefined;
    }

    clearPendingTimers();
    setTransportState('paused');

    const newSound = new Howl({
      src: [audioUrl],
      autoplay: false,
      html5: true,
      volume: 0,
      format: ['mp3'],
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
  }, [audioUrl, clearPendingTimers]);

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
