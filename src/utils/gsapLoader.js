let cached = null;

export async function loadGsap() {
  if (cached) return cached;
  const gsapModule = await import('gsap');
  const { Draggable } = await import('gsap/Draggable');
  const gsap = gsapModule.default || gsapModule.gsap || gsapModule;
  gsap.registerPlugin(Draggable);
  cached = { gsap, Draggable };
  return cached;
}
