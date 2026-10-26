import { createApp } from 'vue';
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';
import App from './App.vue';
import { router } from './router.js';
import { cargarCanal } from './composables/useCanal.js';
import './styles/main.css';

gsap.registerPlugin(DrawSVGPlugin, Flip);

// Sin señal (el pase guardado del visitante) no se consulta el canal: solo importa en el panel.
if (navigator.onLine) cargarCanal();
createApp(App).use(router).mount('#app');

// Service worker solo en el build: deja el pase del visitante disponible sin señal.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
