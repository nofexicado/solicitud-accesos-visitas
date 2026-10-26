// Aplica el tema guardado antes del primer pintado (archivo aparte: la CSP no permite scripts en línea).
try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch { /* sin almacenamiento */ }
