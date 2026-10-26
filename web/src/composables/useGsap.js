// Toda animación del portal pasa por acá: gsap.context() acota los selectores al componente y
// gsap.matchMedia() separa el movimiento completo del reducido. Al desmontar se revierte todo.
import { onMounted, onUnmounted } from 'vue';
import { gsap } from 'gsap';

export const CONDICIONES = {
  completo: '(prefers-reduced-motion: no-preference)',
  reducido: '(prefers-reduced-motion: reduce)',
};

/**
 * setup({ completo, reducido }) corre al montar dentro del contexto; si devuelve una función, se
 * llama al revertir (para cortar intervalos o listeners). Para animar después, desde handlers o
 * watchers, se usa add(() => ...): busca el contexto al momento de llamarla, así funciona aunque se
 * desestructure antes de montar.
 */
export function useGsap(scopeRef, setup) {
  let ctx = null;
  onMounted(() => {
    ctx = gsap.context(() => {
      if (!setup) return;
      const mm = gsap.matchMedia();
      mm.add(CONDICIONES, (c) => setup(c.conditions));
    }, scopeRef.value);
  });
  onUnmounted(() => ctx?.revert());
  return {
    add: (fn) => ctx?.add(fn),
    reducido: () => matchMedia(CONDICIONES.reducido).matches,
  };
}
