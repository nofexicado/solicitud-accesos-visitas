import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// Las vistas internas (operador, portería, admin) salen en assets/int/ para que el nginx
// externo pueda negar esa carpeta entera: desde internet ni siquiera se descarga su código.
const INTERNAS = /[\\/]views[\\/](operador|porteria|admin)[\\/]/;

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // En desarrollo el proxy hace de nginx. VITE_CANAL=interno simula la LAN.
      '/api': {
        target: 'http://127.0.0.1:3100',
        headers: { 'X-Canal': process.env.VITE_CANAL === 'interno' ? 'interno' : 'externo' },
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => INTERNAS.test(id)) ? 'assets/int/[name]-[hash].js' : 'assets/[name]-[hash].js',
        // Los estilos de esas vistas también van a assets/int/.
        assetFileNames: (asset) =>
          (asset.originalFileNames ?? []).some((id) => INTERNAS.test(id)) || /^(OperadorView|IngresarView|panel)\b/.test(asset.names?.[0] ?? '')
            ? 'assets/int/[name]-[hash][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
