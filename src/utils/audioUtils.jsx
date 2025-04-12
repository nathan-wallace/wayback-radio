export const animateScreen = async (ref, turnOn) => {
  const { gsap } = await import('gsap');
  if (!ref.current) return;

  if (turnOn) {
    gsap.fromTo(
      ref.current,
      { opacity: 0, filter: 'blur(8px) contrast(0)' },
      { opacity: 1, filter: 'blur(0px) contrast(1)', duration: 0.6, ease: 'power2.out' }
    );
  } else {
    gsap.to(ref.current, {
      opacity: 0,
      filter: 'blur(8px) contrast(0)',
      duration: 0.6,
      ease: 'power2.in'
    });
  }
};