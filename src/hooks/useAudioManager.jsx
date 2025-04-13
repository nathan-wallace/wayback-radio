// useAudioManager.jsx
import { useEffect, useState } from 'react';
import { Howl } from 'howler';

export const useAudioManager = (audioUrl, isOn, volume) => {
  const [sound, setSound] = useState(null);

  // Create a new Howl instance only when audioUrl changes.
  useEffect(() => {
    if (!audioUrl) return;

    const newSound = new Howl({
      src: [audioUrl],
      autoplay: false,
      html5: true,
      volume: 0, // Start with zero volume for a fade-in.
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

  // Manage play/pause without reloading the audio.
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

  // Update volume changes.
  useEffect(() => {
    if (sound) {
      sound.volume(volume);
    }
  }, [volume, sound]);

  return { sound };
};
