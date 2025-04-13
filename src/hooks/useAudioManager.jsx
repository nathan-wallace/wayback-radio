// useAudioManager.jsx
import { useEffect, useState } from 'react';
import { Howl } from 'howler';

export const useAudioManager = (audioUrl, isOn, volume) => {
  const [sound, setSound] = useState(null);

  // Create a new Howl instance only when the audioUrl changes
  useEffect(() => {
    if (!audioUrl) return;

    const newSound = new Howl({
      src: [audioUrl],
      autoplay: false,
      html5: true,
      volume: 0, // start with volume 0 to allow a fade in
      format: ['mp3'],
      onplay: () => newSound.fade(0, volume, 500)
    });

    setSound(newSound);

    // Clean up when the audioUrl changes
    return () => {
      // Stop and unload the current sound when a new audioUrl is provided.
      newSound.stop();
      newSound.unload();
    };
  }, [audioUrl]);

  // Manage play/pause without unloading the sound when toggling on/off
  useEffect(() => {
    if (!sound) return;
  
    if (isOn) {
      // Resume playing if paused, or start if not already playing
      if (!sound.playing()) {
        sound.play();
        sound.fade(0, volume, 500);
      }
    } else {
      // Pause with a fadeout
      sound.fade(volume, 0, 500);
      setTimeout(() => {
        if (sound.playing()) {
          sound.pause();
        }
      }, 500);
    }
  }, [isOn, sound, volume]);

  // Update volume if it changes
  useEffect(() => {
    if (sound) {
      sound.volume(volume);
    }
  }, [volume, sound]);

  return { sound };
};
