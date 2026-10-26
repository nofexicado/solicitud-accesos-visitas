<script setup>
import Campo from './Campo.vue';

defineProps({ modelo: { type: Object, required: true }, errores: { type: Object, default: () => ({}) } });
</script>

<template>
  <div class="paso-grilla">
    <Campo v-slot="c" class="ancho" rotulo="Razón social de la empresa" :error="errores.razon_social">
      <input :id="c.id" v-model="modelo.razon_social" class="entrada" autocomplete="organization" :aria-invalid="c.invalido" :aria-describedby="c.describe">
    </Campo>
    <Campo v-slot="c" rotulo="CUIT" ayuda="Con o sin guiones: 30-12345678-1" :error="errores.cuit">
      <input :id="c.id" v-model="modelo.cuit" class="entrada num" inputmode="numeric" autocomplete="off" maxlength="13" :aria-invalid="c.invalido" :aria-describedby="c.describe">
    </Campo>
    <Campo v-slot="c" rotulo="Tu nombre y apellido" :error="errores.solicitante_nombre">
      <input :id="c.id" v-model="modelo.solicitante_nombre" class="entrada" autocomplete="name" :aria-invalid="c.invalido" :aria-describedby="c.describe">
    </Campo>
    <Campo v-slot="c" rotulo="Email" ayuda="Te escribimos acá en cada etapa y te mandamos el pase." :error="errores.email">
      <input :id="c.id" v-model="modelo.email" class="entrada" type="email" autocomplete="email" inputmode="email" :aria-invalid="c.invalido" :aria-describedby="c.describe">
    </Campo>
    <Campo v-slot="c" rotulo="Teléfono" ayuda="Con código de área: 2964 41-5520" :error="errores.telefono">
      <input :id="c.id" v-model="modelo.telefono" class="entrada num" type="tel" autocomplete="tel" :aria-invalid="c.invalido" :aria-describedby="c.describe">
    </Campo>
    <p class="privacidad ancho">Usamos estos datos solo para gestionar el ingreso. Los adjuntos y los datos personales se borran 12 meses después de que la solicitud se cierra.</p>
  </div>
</template>
