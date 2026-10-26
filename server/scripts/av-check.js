// Verifica que el servicio pueda escanear con Microsoft Defender (paso del deploy).
//   node scripts/av-check.js           escanea un archivo limpio: tiene que dar "limpio".
//   node scripts/av-check.js --eicar   escanea el archivo de prueba EICAR: tiene que dar "amenaza".
//                                      Ojo: en equipos con monitoreo, EICAR genera una alerta de
//                                      seguridad. Avisar a quien corresponda antes de correrlo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { escanear } from '../src/modules/antivirus.js';

config.AV_ENABLED = true;
if (!fs.existsSync(config.AV_MPCMDRUN)) {
  console.error(`No existe ${config.AV_MPCMDRUN}. Revisá AV_MPCMDRUN en server/.env.`);
  process.exit(1);
}
const eicar = process.argv.includes('--eicar');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accesos-av-'));
const archivo = path.join(dir, eicar ? 'eicar.txt' : 'limpio.txt');
// La cadena EICAR se arma en partes para que este script no sea detectado como amenaza.
const contenido = eicar
  ? ['X5O!P%@AP[4\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('')
  : 'Archivo de prueba del portal de accesos.\n';
fs.writeFileSync(archivo, contenido);
const inicio = Date.now();
const r = await escanear(archivo);
fs.rmSync(dir, { recursive: true, force: true });
const esperado = eicar ? 'amenaza' : 'limpio';
console.log(`Resultado: ${r.resultado}${r.detalle ? ` (${r.detalle})` : ''} en ${Date.now() - inicio} ms. Esperado: ${esperado}.`);
process.exit(r.resultado === esperado ? 0 : 1);
