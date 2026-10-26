<script setup>
// Ingreso al panel de operador (solo desde la red interna).
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LogoMark from '../../components/LogoMark.vue';
import { destinoTrasLogin, ingresar } from '../../composables/useSesion.js';
import './panel.css';

const route = useRoute();
const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');
const errores = ref({});
const enviando = ref(false);

async function enviar() {
  error.value = '';
  errores.value = {};
  if (!email.value.trim()) errores.value.email = 'Escribí tu email';
  if (!password.value) errores.value.password = 'Escribí tu contraseña';
  if (Object.keys(errores.value).length) return;
  enviando.value = true;
  try {
    const u = await ingresar(email.value.trim(), password.value);
    await router.replace(destinoTrasLogin(route.query.volver, u));
  } catch (e) {
    error.value = e.message;
    errores.value = e.campos ?? {};
    password.value = '';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <main id="contenido" class="op ingresar">
    <form class="panel caja" novalidate @submit.prevent="enviar">
      <div class="marca">
        <LogoMark class="logo" />
        <span class="muted">Accesos a yacimientos</span>
      </div>
      <h1>Ingresar al panel</h1>
      <p class="muted">Para HSE, autorizantes y portería. Usá tu email de la empresa.</p>

      <p v-if="error" class="aviso error" role="alert"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>

      <div class="campo-op">
        <label for="email">Email</label>
        <input id="email" v-model="email" class="control" type="email" autocomplete="username" inputmode="email"
               :aria-invalid="Boolean(errores.email)" :aria-describedby="errores.email ? 'email-error' : undefined">
        <span v-if="errores.email" id="email-error" class="error-campo">{{ errores.email }}</span>
      </div>
      <div class="campo-op">
        <label for="password">Contraseña</label>
        <input id="password" v-model="password" class="control" type="password" autocomplete="current-password"
               :aria-invalid="Boolean(errores.password)" :aria-describedby="errores.password ? 'password-error' : undefined">
        <span v-if="errores.password" id="password-error" class="error-campo">{{ errores.password }}</span>
      </div>
      <button class="btn primario enviar" type="submit" :disabled="enviando">{{ enviando ? 'Ingresando…' : 'Ingresar' }}</button>
      <p class="nota muted">¿Te olvidaste la contraseña? Pedile a un administrador que te genere una nueva.</p>
    </form>
    <RouterLink class="volver muted" to="/">Volver al portal de solicitudes</RouterLink>
  </main>
</template>

<style scoped>
.ingresar { min-height: 100svh; display: grid; place-content: center; justify-items: center; gap: 20px; padding: 24px 16px; }
.caja { width: min(400px, calc(100vw - 32px)); display: grid; gap: 16px; padding: 28px; }
.marca { display: grid; gap: 6px; margin-bottom: 8px; }
.marca .logo { width: 112px; color: var(--ink); }
h1 { font-size: var(--fs-title); line-height: 34px; font-weight: 650; font-stretch: var(--ancho-titulo); }
.caja > p.muted { margin-top: -8px; }
.campo-op { display: grid; gap: 6px; }
.campo-op label { font-weight: 600; }
.enviar { height: 40px; margin-top: 4px; }
.nota { font-size: var(--fs-body); }
.volver { text-underline-offset: 4px; }
.volver:hover { color: var(--ink); }
@media (max-width: 900px) { .enviar { height: 44px; } }
</style>
