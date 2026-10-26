<script setup>
import LogoMark from './LogoMark.vue';
import Barrera from './Barrera.vue';

// PLACEHOLDER: casilla a definir; en producción coincide con MAIL_FROM del .env.
const CONTACTO = 'accesos@ejemplo.com';
</script>

<template>
  <div class="franja"><Barrera :barras="40" alto="8px" /></div>
  <footer>
    <LogoMark class="marca-pie" />
    <div class="enlaces">
      <div><h2>Solicitudes</h2><RouterLink to="/solicitud/nueva">Nueva solicitud</RouterLink><RouterLink to="/mis-solicitudes">Mis solicitudes</RouterLink><RouterLink to="/mis-solicitudes#consultar">Consultar una solicitud</RouterLink></div>
      <div><h2>Seguridad</h2><RouterLink to="/requisitos-hse">Requisitos HSE</RouterLink><RouterLink to="/#preguntas">Preguntas frecuentes</RouterLink></div>
      <div class="contacto"><h2>Consultas sobre tu solicitud</h2><a :href="`mailto:${CONTACTO}`">{{ CONTACTO }}</a><span>Tené a mano el número de solicitud.</span></div>
    </div>
    <!-- Créditos de las fotos temporales: se van con ellas cuando estén las propias. -->
    <p class="creditos">Fotos: "Tierra del Fuego Steppe" de Jason Hollinger, CC BY 2.0; "Río Fuego 1" de Jorge Morales Piderit, CC0; "Sheep and Clouds Tierra del Fuego Chile" y "Running Guanaco Tierra del Fuego Chile" de amanderson2, CC BY 2.0, vía Wikimedia Commons; "Dusty Roads on Tierra del Fuego" de VicunaR, CC BY-SA 2.0, vía Flickr.</p>
    <div class="ultima"><span>© {{ new Date().getFullYear() }} · Proyecto de ejemplo</span><RouterLink class="btn-corte" to="/solicitud/nueva">Nueva solicitud</RouterLink></div>
  </footer>
</template>

<style scoped>
.franja { height: 8px; margin-top: clamp(96px, 11vw, 200px); overflow: hidden; }
footer { background: var(--campo); color: var(--campo-ink); padding: 56px var(--margin) 28px; font-size: var(--t-nota); }
.marca-pie { width: min(100%, 300px); color: var(--campo-ink); }
.enlaces { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; row-gap: 32px; margin-top: 48px; }
.enlaces div { grid-column: span 2; display: grid; align-content: start; gap: 10px; }
.enlaces h2 { font-size: var(--t-nota); font-weight: 650; font-stretch: 100%; letter-spacing: 0; }
.enlaces a { text-decoration: none; color: var(--campo-muted); }
.enlaces a:hover { color: var(--campo-ink); text-decoration: underline; text-underline-offset: 4px; }
.enlaces span { color: var(--campo-muted); }
.enlaces .contacto { grid-column: 9 / 13; }
.creditos { margin-top: 48px; color: var(--campo-muted); max-width: 68ch; }
.ultima { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 20px; }
.ultima .btn-corte { --h: 40px; background: var(--campo-ink); color: var(--campo); }
@media (max-width: 760px) {
  .enlaces div { grid-column: span 6; }
  .enlaces .contacto { grid-column: 1 / -1; }
}
</style>
