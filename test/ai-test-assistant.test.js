// Pruebas del módulo de IA con un fetch simulado (mock): no necesitan Ollama.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const asistente = require('../scripts/ai/testAssistant');

const catalogo = require(path.join(__dirname, '..', 'docs', 'harness', 'catalogo-requisitos.json'));

function fetchSimulado(contenido, { status = 200 } = {}) {
  const llamadas = [];
  const impl = async (url, opciones) => {
    llamadas.push({ url, body: JSON.parse(opciones.body) });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => 'error simulado',
      json: async () => ({
        model: 'llama3.2',
        message: { role: 'assistant', content: typeof contenido === 'string' ? contenido : JSON.stringify(contenido) },
        done: true,
        prompt_eval_count: 10,
        eval_count: 20
      })
    };
  };
  return { impl, llamadas };
}

const proveedorCon = (contenido, opciones) => {
  const simulado = fetchSimulado(contenido, opciones);
  const proveedor = asistente.crearProveedorOllama({ url: 'http://ollama.test:11434', modelo: 'llama3.2', fetchImpl: simulado.impl });
  return { proveedor, llamadas: simulado.llamadas };
};

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

test('generarCasos llama a Ollama /api/chat sin streaming, con esquema JSON y el contexto de la HU', async () => {
  const { proveedor, llamadas } = proveedorCon({ casos: [casoValido] });
  const resultado = await asistente.generarCasos({ proveedor, catalogo, hu: 'HU-001', maximo: 3 });
  const [{ url, body }] = llamadas;
  assert.equal(url, 'http://ollama.test:11434/api/chat');
  assert.equal(body.model, 'llama3.2');
  assert.equal(body.stream, false);
  assert.equal(body.format.type, 'object');
  assert.deepEqual(body.format.required, ['casos']);
  assert.equal(body.format.$schema, undefined);
  const texto = body.messages[1].content;
  for (const fragmento of ['HU-001', 'A13', 'CP-24', 'como máximo 3']) assert.match(texto, new RegExp(fragmento));
  assert.equal(resultado.casos.length, 1);
  assert.equal(resultado.proveedor, 'ollama');
  assert.match(resultado.revision_humana, /Pendiente/);
});

test('la validación del arnés descarta casos con HU, criterio o ID inválidos', async () => {
  const { proveedor } = proveedorCon({
    casos: [
      casoValido,
      { ...casoValido, id_propuesto: 'IA-HU-001-02', criterio: 'A99' },
      { ...casoValido, id_propuesto: 'CP-09' },
      { ...casoValido, id_propuesto: 'IA-HU-001-04', hu: 'HU-005' }
    ]
  });
  const resultado = await asistente.generarCasos({ proveedor, catalogo, hu: 'HU-001' });
  assert.deepEqual(resultado.casos.map((c) => c.id_propuesto), ['IA-HU-001-01']);
  assert.equal(resultado.descartados_por_validacion.length, 3);
});

test('una HU inexistente se rechaza sin consultar el modelo', async () => {
  const { proveedor, llamadas } = proveedorCon({ casos: [] });
  await assert.rejects(asistente.generarCasos({ proveedor, catalogo, hu: 'HU-999' }), asistente.AsistenteIAError);
  assert.equal(llamadas.length, 0);
});

test('respuestas inválidas del modelo se rechazan: JSON roto o fuera del esquema', async () => {
  await assert.rejects(
    asistente.generarCasos({ proveedor: proveedorCon('esto no es json').proveedor, catalogo, hu: 'HU-001' }),
    /JSON válido/
  );
  await assert.rejects(
    asistente.generarCasos({ proveedor: proveedorCon({ casos: [{ ...casoValido, tecnica: 'magia' }] }).proveedor, catalogo, hu: 'HU-001' }),
    /esquema/
  );
  await assert.rejects(
    asistente.generarCasos({ proveedor: proveedorCon({}, { status: 404 }).proveedor, catalogo, hu: 'HU-001' }),
    /Ollama respondió 404/
  );
});

test('si Ollama no está disponible el error explica cómo instalarlo', async () => {
  const proveedor = asistente.crearProveedorOllama({
    url: 'http://127.0.0.1:9',
    fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }
  });
  await assert.rejects(asistente.generarCasos({ proveedor, catalogo, hu: 'HU-001' }), /ollama pull/);
});

test('clasificarFallos no consulta la IA cuando todo está aprobado', async () => {
  const { proveedor, llamadas } = proveedorCon({});
  const resultado = await asistente.clasificarFallos({
    proveedor,
    reporte: { resultados: [{ cp: 'CP-01', variante: 'a', estado: 'Aprobado' }] }
  });
  assert.equal(resultado.llamada_ia, false);
  assert.equal(llamadas.length, 0);
});

test('clasificarFallos envía solo las variantes no aprobadas con esperado y observado', async () => {
  const { proveedor, llamadas } = proveedorCon({
    resumen: 'Un defecto de producto.',
    fallos: [{
      cp: 'CP-13', variante: 'd', categoria: 'defecto-producto', causa_probable: 'ID sin validar',
      area_sospechosa: 'reservationService', siguiente_paso: 'Validar UUID', crear_defecto_jira: true, severidad_sugerida: 'Alta'
    }]
  });
  const resultado = await asistente.clasificarFallos({
    proveedor,
    reporte: {
      ejecucion: 'prueba',
      resultados: [
        { cp: 'CP-01', variante: 'a', estado: 'Aprobado', esperado: 'x', observado: 'x' },
        { cp: 'CP-13', variante: 'd', hu: 'HU-001', criterio: 'A08', estado: 'Fallido', esperado: '400', observado: '500 error interno' }
      ]
    }
  });
  const texto = llamadas[0].body.messages[1].content;
  assert.match(texto, /CP-13 d/);
  assert.doesNotMatch(texto, /CP-01 a/);
  assert.equal(resultado.llamada_ia, true);
  assert.match(asistente.aMarkdown(resultado), /Sí \(Alta\)/);
});
