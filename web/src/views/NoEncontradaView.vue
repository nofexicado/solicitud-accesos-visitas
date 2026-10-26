<template>
  <div class="wrap pagina">
    <h1>Esta página no existe</h1>
    <p>Puede que el enlace esté mal escrito o que la página se haya movido.</p>
    <div class="acciones">
      <RouterLink class="btn-corte" to="/">Ir al inicio</RouterLink>
      <RouterLink class="enlace" to="/mis-solicitudes">Ver mis solicitudes</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.pagina { padding-top: 72px; display: grid; gap: 20px; max-width: 62ch; }
h1 { font-size: var(--t-seccion); line-height: 1.04; }
.acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 28px; margin-top: 8px; }
@media (max-width: 760px) { h1 { font-size: var(--t-seccion-chico); } }
</style>
