#!/usr/bin/env node
/*
 * Asistente de IA del arnés de pruebas (gratuito, con Ollama).
 *
 *   node scripts/ai-test-assistant.js generar --hu HU-001 [--maximo 8]
 *   node scripts/ai-test-assistant.js clasificar --resultados <ruta/resultados.json>
 *
 * Requisitos: Ollama en ejecución (https://ollama.com/download) y el modelo
 * descargado: `ollama pull llama3.2`. Variables opcionales: OLLAMA_URL, IA_MODELO.
 * Salida: reports/ia/ (excluida de Git). Todo resultado requiere revisión humana.
 */
const fs = require('node:fs');
const path = require('node:path');
const asistente = require('./ai/testAssistant');

const raiz = path.join(__dirname, '..');

function argumento(nombre, porDefecto) {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice > 0 && process.argv[indice + 1] ? process.argv[indice + 1] : porDefecto;
}

function guardar(nombreBase, resultado, salida) {
  fs.mkdirSync(salida, { recursive: true });
  const json = path.join(salida, `${nombreBase}.json`);
  const md = path.join(salida, `${nombreBase}.md`);
  fs.writeFileSync(json, `${JSON.stringify(resultado, null, 2)}\n`);
  fs.writeFileSync(md, `${asistente.aMarkdown(resultado)}\n`);
  return [json, md].map((archivo) => path.relative(raiz, archivo));
}

async function main() {
  const comando = process.argv[2];
  const salida = path.resolve(argumento('salida', path.join(raiz, 'reports', 'ia')));
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const proveedor = asistente.crearProveedorOllama();

  if (comando === 'generar') {
    const hu = argumento('hu');
    if (!hu) throw new asistente.AsistenteIAError('Indica la historia: --hu HU-001');
    const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, 'docs', 'harness', 'catalogo-requisitos.json'), 'utf8'));
    console.log(`Generando casos para ${hu} con ${proveedor.nombre}/${proveedor.modelo}...`);
    const inicio = Date.now();
    const resultado = await asistente.generarCasos({ proveedor, catalogo, hu, maximo: Number(argumento('maximo', 8)) });
    resultado.duracion_segundos = Math.round((Date.now() - inicio) / 1000);
    const archivos = guardar(`casos-${hu}-${marca}`, resultado, salida);
    console.log(`${resultado.casos.length} casos propuestos (${resultado.descartados_por_validacion.length} descartados por validación) en ${resultado.duracion_segundos} s.`);
    console.log(`Revisión humana pendiente. Archivos: ${archivos.join(', ')}`);
    return;
  }

  if (comando === 'clasificar') {
    const ruta = argumento('resultados');
    if (!ruta) throw new asistente.AsistenteIAError('Indica el archivo: --resultados <ruta/resultados.json>');
    const reporte = JSON.parse(fs.readFileSync(path.resolve(ruta), 'utf8'));
    const resultado = await asistente.clasificarFallos({ proveedor, reporte });
    const archivos = guardar(`clasificacion-${marca}`, resultado, salida);
    console.log(resultado.resumen);
    console.log(`Archivos: ${archivos.join(', ')}`);
    return;
  }

  console.log('Uso:\n  node scripts/ai-test-assistant.js generar --hu HU-001 [--maximo 8]\n  node scripts/ai-test-assistant.js clasificar --resultados <ruta>');
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof asistente.AsistenteIAError ? error.message : `No se pudo ejecutar el asistente: ${error.message}`);
  process.exitCode = 1;
});
