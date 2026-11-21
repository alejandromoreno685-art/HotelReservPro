#!/usr/bin/env node
/*
 * Asistente de IA del arnés de pruebas.
 *
 *   node scripts/ai-test-assistant.js generar --hu HU-001 [--maximo 8]
 *   node scripts/ai-test-assistant.js clasificar --resultados <ruta/resultados.json>
 *
 * Credenciales: ANTHROPIC_API_KEY (o un perfil de `ant auth login`).
 * Salida: reports/ia/ (excluida de Git). Todo resultado requiere revisión humana.
 */
const fs = require('node:fs');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk');
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

  if (comando === 'generar') {
    const hu = argumento('hu');
    if (!hu) throw new asistente.AsistenteIAError('Indica la historia: --hu HU-001');
    const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, 'docs', 'harness', 'catalogo-requisitos.json'), 'utf8'));
    const resultado = await asistente.generarCasos({
      client: new Anthropic(), catalogo, hu, maximo: Number(argumento('maximo', 8))
    });
    const archivos = guardar(`casos-${hu}-${marca}`, resultado, salida);
    console.log(`${resultado.casos.length} casos propuestos para ${hu} (${resultado.descartados_por_validacion.length} descartados por validación).`);
    console.log(`Revisión humana pendiente. Archivos: ${archivos.join(', ')}`);
    return;
  }

  if (comando === 'clasificar') {
    const ruta = argumento('resultados');
    if (!ruta) throw new asistente.AsistenteIAError('Indica el archivo: --resultados <ruta/resultados.json>');
    const reporte = JSON.parse(fs.readFileSync(path.resolve(ruta), 'utf8'));
    const fallos = asistente.extraerFallos(reporte);
    // Solo se crea el cliente si hay algo que analizar.
    const resultado = await asistente.clasificarFallos({
      client: fallos.length ? new Anthropic() : null, reporte
    });
    const archivos = guardar(`clasificacion-${marca}`, resultado, salida);
    console.log(resultado.resumen);
    console.log(`Archivos: ${archivos.join(', ')}`);
    return;
  }

  console.log('Uso:\n  node scripts/ai-test-assistant.js generar --hu HU-001 [--maximo 8]\n  node scripts/ai-test-assistant.js clasificar --resultados <ruta>');
  process.exitCode = 2;
}

main().catch((error) => {
  if (error instanceof asistente.AsistenteIAError) {
    console.error(error.message);
  } else if (error instanceof Anthropic.AuthenticationError) {
    console.error('Credenciales de Anthropic inválidas o ausentes. Define ANTHROPIC_API_KEY o ejecuta `ant auth login`.');
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error('Límite de solicitudes alcanzado; intenta de nuevo en unos minutos.');
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Error de la API de Anthropic (${error.status}): ${error.message}`);
  } else if (error instanceof Anthropic.AnthropicError) {
    console.error(`No se pudo usar la API de Anthropic: ${error.message}`);
  } else {
    // Incluye la ausencia de credenciales, que el SDK informa como Error genérico.
    console.error(`No se pudo ejecutar el asistente: ${error.message}`);
    console.error('Si faltan credenciales, define ANTHROPIC_API_KEY o ejecuta `ant auth login`.');
  }
  process.exitCode = 1;
});
