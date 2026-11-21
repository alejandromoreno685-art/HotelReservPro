// Pruebas del módulo de IA con un cliente simulado (mock): no consumen la API.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const asistente = require('../scripts/ai/testAssistant');

const catalogo = require(path.join(__dirname, '..', 'docs', 'harness', 'catalogo-requisitos.json'));

function clienteSimulado(respuesta) {
  const llamadas = [];
  return {
    llamadas,
    beta: {
      messages: {
        parse: async (params) => {
          llamadas.push(params);
          return { model: asistente.MODELO, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, ...respuesta };
        }
      }
    }
  };
}

const casoValido = {
  id_propuesto: 'IA-HU-001-01',
  hu: 'HU-001',
  criterio: 'A06',
  tecnica: 'valor-limite',
  descripcion: 'Estadía de una sola noche que termina el 29 de febrero de un año bisiesto',
  entrada: 'checkIn 2028-02-28, checkOut 2028-02-29, 1 huésped',
  resultado_esperado: '201 y una noche en el comprobante',
  prioridad: 'Media',
  relacion_con_existentes: 'Complementa CP-11 (fechas imposibles)',
  justificacion: 'CP-11 solo prueba una fecha inexistente'
};

test('generarCasos envía la HU, sus criterios y casos existentes, con Opus 5.5 y fallback', async () => {
  const client = clienteSimulado({ parsed_output: { casos: [casoValido] } });
  const resultado = await asistente.generarCasos({ client, catalogo, hu: 'HU-001', maximo: 3 });
  const [params] = client.llamadas;
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.fallbacks, 'default');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(params.thinking, undefined, 'Opus 5.5 no admite desactivar thinking; no se envía');
  assert.ok(params.output_config.format, 'usa salida estructurada');
  const texto = params.messages[0].content;
  for (const fragmento of ['HU-001', 'A13', 'CP-24', 'como máximo 3']) assert.match(texto, new RegExp(fragmento));
  assert.equal(resultado.casos.length, 1);
  assert.match(resultado.revision_humana, /Pendiente/);
});

test('la validación del arnés descarta casos con HU, criterio o ID inválidos', async () => {
  const client = clienteSimulado({
    parsed_output: {
      casos: [
        casoValido,
        { ...casoValido, id_propuesto: 'IA-HU-001-02', criterio: 'A99' },
        { ...casoValido, id_propuesto: 'CP-09' },
        { ...casoValido, id_propuesto: 'IA-HU-001-04', hu: 'HU-005' }
      ]
    }
  });
  const resultado = await asistente.generarCasos({ client, catalogo, hu: 'HU-001' });
  assert.deepEqual(resultado.casos.map((c) => c.id_propuesto), ['IA-HU-001-01']);
  assert.equal(resultado.descartados_por_validacion.length, 3);
});

test('una HU inexistente se rechaza sin llamar a la API', async () => {
  const client = clienteSimulado({ parsed_output: { casos: [] } });
  await assert.rejects(asistente.generarCasos({ client, catalogo, hu: 'HU-999' }), asistente.AsistenteIAError);
  assert.equal(client.llamadas.length, 0);
});

test('clasificarFallos no llama a la IA cuando todo está aprobado', async () => {
  const resultado = await asistente.clasificarFallos({
    client: null,
    reporte: { resultados: [{ cp: 'CP-01', variante: 'a', estado: 'Aprobado' }] }
  });
  assert.equal(resultado.llamada_ia, false);
  assert.equal(resultado.fallos.length, 0);
});

test('clasificarFallos envía solo las variantes no aprobadas con esperado y observado', async () => {
  const clasificacion = {
    resumen: 'Un defecto de producto.',
    fallos: [{
      cp: 'CP-13', variante: 'd', categoria: 'defecto-producto', causa_probable: 'ID sin validar',
      area_sospechosa: 'reservationService', siguiente_paso: 'Validar UUID', crear_defecto_jira: true, severidad_sugerida: 'Alta'
    }]
  };
  const client = clienteSimulado({ parsed_output: clasificacion });
  const resultado = await asistente.clasificarFallos({
    client,
    reporte: {
      ejecucion: 'prueba',
      resultados: [
        { cp: 'CP-01', variante: 'a', estado: 'Aprobado', esperado: 'x', observado: 'x' },
        { cp: 'CP-13', variante: 'd', hu: 'HU-001', criterio: 'A08', estado: 'Fallido', esperado: '400', observado: '500 error interno' }
      ]
    }
  });
  const texto = client.llamadas[0].messages[0].content;
  assert.match(texto, /CP-13 d/);
  assert.doesNotMatch(texto, /CP-01 a/);
  assert.equal(resultado.llamada_ia, true);
  assert.match(asistente.aMarkdown(resultado), /Sí \(Alta\)/);
});

test('un rechazo del modelo o una salida inválida se informan como error controlado', async () => {
  const reporte = { resultados: [{ cp: 'CP-13', variante: 'd', estado: 'Fallido', esperado: '400', observado: '500' }] };
  await assert.rejects(
    asistente.clasificarFallos({ client: clienteSimulado({ stop_reason: 'refusal', stop_details: { category: null } }), reporte }),
    /rechazó/
  );
  await assert.rejects(
    asistente.clasificarFallos({ client: clienteSimulado({ parsed_output: null }), reporte }),
    /formato esperado/
  );
});
