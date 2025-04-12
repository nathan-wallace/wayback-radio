import { useEffect, useState } from 'react';
import { Howl } from 'howler';

export const useAudioManager = (audioUrl, isOn, volume) => {
  const [sound, setSound] = useState(null);

  useEffect(() => {
    if (!audioUrl || !isOn) return;

    const newSound = new Howl({
      src: [audioUrl],
      autoplay: false,
      html5: true,
      volume: 0,
      format: ['mp3'],
      onplay: () => newSound.fade(0, volume, 500),
    });

    newSound.play();
    setSound(newSound);

    return () => {
      if (newSound) {
        newSound.fade(volume, 0, 500);
        setTimeout(() => {
          newSound.stop();
          newSound.unload();
        }, 500);
      }
    };
  }, [audioUrl, isOn]);

  useEffect(() => {
    if (sound) sound.volume(volume);
  }, [volume]);

  return { sound };
};