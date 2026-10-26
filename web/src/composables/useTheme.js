// Tema: sistema → claro → oscuro. Se guarda solo en este navegador.
import { ref } from 'vue';

const TEMAS = [
  { valor: null, rotulo: 'Tema del sistema' },
  { valor: 'light', rotulo: 'Tema claro' },
  { valor: 'dark', rotulo: 'Tema oscuro' },
];

const leer = () => {
  try { return localStorage.getItem('tema'); } catch { return null; }
};
const indice = ref(Math.max(0, TEMAS.findIndex((t) => t.valor === leer())));

export function useTheme() {
  const aplicar = () => {
    const { valor } = TEMAS[indice.value];
    if (valor) document.documentElement.dataset.theme = valor;
    else delete document.documentElement.dataset.theme;
    try { valor ? localStorage.setItem('tema', valor) : localStorage.removeItem('tema'); } catch { /* sin almacenamiento */ }
  };
  const siguiente = () => {
    indice.value = (indice.value + 1) % TEMAS.length;
    aplicar();
  };
  return { tema: indice, rotulo: () => TEMAS[indice.value].rotulo, siguiente };
}
