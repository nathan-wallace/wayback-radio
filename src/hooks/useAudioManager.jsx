// useAudioManager.jsx
import { useEffect, useState } from 'react';
import { Howl } from 'howler';

export const useAudioManager = (audioUrl, isOn, volume) => {
  const [sound, setSound] = useState(null);

  // Create a new Howl instance whenever audioUrl changes.
  useEffect(() => {
    if (!audioUrl) return;

    const newSound = new Howl({
      src: [audioUrl],
      autoplay: false,
      html5: true,
      volume: 0, // Start with zero for a fade-in effect.
      format: ['mp3'],
      onplay: () => newSound.fade(0, volume, 500),
    });

    setSound(newSound);

    return () => {
      if (newSound) {
        newSound.stop();
        newSound.unload();
      }
    };
  }, [audioUrl]);

  // Play/pause management.
  useEffect(() => {
    if (!sound) return;

    if (isOn) {
      if (!sound.playing()) {
        sound.play();
        sound.fade(0, volume, 500);
      }
    } else {
      sound.fade(volume, 0, 500);
      setTimeout(() => {
        if (sound.playing()) {
          sound.pause();
        }
      }, 500);
    }
  }, [isOn, sound, volume]);

  // Update volume when changed.
  useEffect(() => {
    if (sound) {
      sound.volume(volume);
    }
  }, [volume, sound]);

  return { sound };
};
