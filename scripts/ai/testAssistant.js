/*
 * Módulo de IA del arnés de pruebas (Trabajo 9).
 *
 * Dos funciones, ambas con revisión humana obligatoria:
 *  1. generarCasos: propone casos de borde que el catálogo actual no cubre.
 *  2. clasificarFallos: lee un resultados.json del ejecutor de evidencias y
 *     clasifica cada variante no aprobada (defecto, prueba frágil, ambiente...).
 *
 * El cliente de Anthropic se recibe como parámetro para poder probar el
 * módulo con un cliente simulado (mock) sin consumir la API.
 */
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const MODELO = 'claude-opus-5-5';

const CasoPropuesto = z.object({
  id_propuesto: z.string(),
  hu: z.string(),
  criterio: z.string(),
  tecnica: z.enum(['valor-limite', 'particion', 'negativo', 'seguridad', 'concurrencia', 'recuperacion', 'usabilidad']),
  descripcion: z.string(),
  entrada: z.string(),
  resultado_esperado: z.string(),
  prioridad: z.enum(['Alta', 'Media', 'Baja']),
  relacion_con_existentes: z.string(),
  justificacion: z.string()
});
const PropuestaCasos = z.object({ casos: z.array(CasoPropuesto) });

const FalloClasificado = z.object({
  cp: z.string(),
  variante: z.string(),
  categoria: z.enum(['defecto-producto', 'prueba-fragil', 'ambiente', 'datos-de-prueba', 'requisito-ambiguo']),
  causa_probable: z.string(),
  area_sospechosa: z.string(),
  siguiente_paso: z.string(),
  crear_defecto_jira: z.boolean(),
  severidad_sugerida: z.enum(['Critica', 'Alta', 'Media', 'Baja'])
});
const Clasificacion = z.object({ resumen: z.string(), fallos: z.array(FalloClasificado) });

class AsistenteIAError extends Error {}

const SISTEMA_GENERAR = [
  'Eres analista de pruebas funcionales (caja negra) de un sistema de reservas hoteleras.',
  'Propones casos de prueba nuevos a partir de requisitos y criterios de aceptación.',
  'Solo propones casos que aporten algo que los casos existentes no cubren: valores límite, particiones,',
  'combinaciones, seguridad, concurrencia o recuperación. No repitas un caso existente con otras palabras.',
  'Cada caso debe ser ejecutable contra la API o la interfaz, con entrada concreta y resultado observable',
  '(código HTTP, estado guardado o mensaje). Usa solo reglas presentes en el catálogo; si una regla no está',
  'definida, dilo en la justificación en lugar de inventarla. Redacta en español.'
].join(' ');

const SISTEMA_CLASIFICAR = [
  'Eres ingeniero de calidad. Recibes las variantes no aprobadas de una ejecución de pruebas funcionales',
  'de un sistema de reservas hoteleras (API Express + SQL Server). Para cada una decides si es más probable',
  'un defecto del producto, una prueba frágil, un problema de ambiente, datos de prueba incorrectos o un',
  'requisito ambiguo, explicando la evidencia que te lleva a esa conclusión. Sugiere crear un defecto en Jira',
  'solo cuando la evidencia apunta al producto. Redacta en español y sé concreto.'
].join(' ');

// Solicitud común: Opus 5.5 con fallback de servidor ante rechazos de seguridad.
async function pedirEstructurado(client, { sistema, contenido, formato, esfuerzo }) {
  const response = await client.beta.messages.parse({
    model: MODELO,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: esfuerzo, format: zodOutputFormat(formato) },
    system: sistema,
    messages: [{ role: 'user', content: contenido }]
  });
  if (response.stop_reason === 'refusal') {
    throw new AsistenteIAError(`El modelo rechazó la solicitud (${response.stop_details?.category || 'sin categoría'}).`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AsistenteIAError('La respuesta se cortó por max_tokens; reduce el alcance (una HU por solicitud).');
  }
  if (!response.parsed_output) {
    throw new AsistenteIAError('La respuesta no cumplió el formato esperado.');
  }
  return { datos: response.parsed_output, modelo: response.model, uso: response.usage };
}

function buscarHistoria(catalogo, hu) {
  const historia = catalogo.historias.find((item) => item.id === hu);
  if (!historia) {
    throw new AsistenteIAError(`La HU ${hu} no existe en el catálogo. Opciones: ${catalogo.historias.map((h) => h.id).join(', ')}.`);
  }
  return historia;
}

// Guarda del arnés: la IA propone, pero solo pasan a revisión los casos que
// referencian una HU y un criterio reales del catálogo.
function validarPropuesta(casos, historia) {
  const criterios = new Set(Object.keys(historia.criterios));
  const aceptados = [];
  const descartados = [];
  for (const caso of casos) {
    const motivos = [];
    if (caso.hu !== historia.id) motivos.push(`HU ${caso.hu} distinta de ${historia.id}`);
    const citados = caso.criterio.split(/[\s,;/]+/).filter(Boolean);
    if (!citados.length || citados.some((c) => !criterios.has(c))) motivos.push(`criterio desconocido: ${caso.criterio}`);
    if (Object.hasOwn(historia.casos_existentes, caso.id_propuesto)) motivos.push(`reutiliza el ID existente ${caso.id_propuesto}`);
    (motivos.length ? descartados : aceptados).push(motivos.length ? { ...caso, motivos } : caso);
  }
  return { aceptados, descartados };
}

async function generarCasos({ client, catalogo, hu, maximo = 8 }) {
  const historia = buscarHistoria(catalogo, hu);
  const contenido = [
    `Sistema: ${catalogo.sistema}. Dominio: ${catalogo.dominio}.`,
    `Reglas del negocio implementadas:\n- ${catalogo.reglas.join('\n- ')}`,
    `Historia ${historia.id} (${historia.jira}): ${historia.titulo}.`,
    `Criterios de aceptación:\n${Object.entries(historia.criterios).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
    `Casos existentes:\n${Object.entries(historia.casos_existentes).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
    `Propón como máximo ${maximo} casos nuevos para ${historia.id}. Usa IDs con el formato IA-${historia.id}-NN`,
    'y en criterio escribe solo IDs de los criterios listados (por ejemplo "A06" o "A06 A08").'
  ].join('\n\n');
  const respuesta = await pedirEstructurado(client, {
    sistema: SISTEMA_GENERAR, contenido, formato: PropuestaCasos, esfuerzo: 'high'
  });
  const { aceptados, descartados } = validarPropuesta(respuesta.datos.casos, historia);
  return {
    tipo: 'generacion',
    hu: historia.id,
    jira: historia.jira,
    modelo: respuesta.modelo,
    revision_humana: 'Pendiente: un integrante debe aprobar cada caso antes de agregarlo a la matriz.',
    casos: aceptados,
    descartados_por_validacion: descartados,
    uso: respuesta.uso
  };
}

function extraerFallos(reporte) {
  return (reporte.resultados || []).filter((item) => item.estado !== 'Aprobado');
}

async function clasificarFallos({ client, reporte }) {
  const fallos = extraerFallos(reporte);
  if (fallos.length === 0) {
    // Sin fallos no se llama a la IA: no hay costo ni nada que analizar.
    return { tipo: 'clasificacion', llamada_ia: false, resumen: 'La ejecución no tiene variantes fallidas ni bloqueadas.', fallos: [] };
  }
  const contenido = [
    `Ejecución: ${reporte.ejecucion || 'sin nombre'} · Ambiente: ${reporte.ambiente ? JSON.stringify(reporte.ambiente) : 'no informado'}`,
    `Resumen: ${JSON.stringify(reporte.resumen || {})}`,
    'Variantes no aprobadas (esperado frente a observado):',
    ...fallos.map((f) => `- ${f.cp} ${f.variante} [${f.hu} · ${f.criterio}] estado=${f.estado}\n  esperado: ${f.esperado}\n  observado: ${f.observado}`)
  ].join('\n');
  const respuesta = await pedirEstructurado(client, {
    sistema: SISTEMA_CLASIFICAR, contenido, formato: Clasificacion, esfuerzo: 'medium'
  });
  return { tipo: 'clasificacion', llamada_ia: true, modelo: respuesta.modelo, ...respuesta.datos, uso: respuesta.uso };
}

function aMarkdown(resultado) {
  if (resultado.tipo === 'generacion') {
    return [
      `# Casos propuestos por IA — ${resultado.hu} (${resultado.jira})`, '',
      `> ${resultado.revision_humana}`, '',
      '| ID | Criterio | Técnica | Entrada | Esperado | Prioridad |', '|---|---|---|---|---|---|',
      ...resultado.casos.map((c) => `| ${c.id_propuesto} | ${c.criterio} | ${c.tecnica} | ${c.entrada.replaceAll('|', '/')} | ${c.resultado_esperado.replaceAll('|', '/')} | ${c.prioridad} |`),
      '', `Descartados por la validación del arnés: ${resultado.descartados_por_validacion.length}`
    ].join('\n');
  }
  return [
    '# Clasificación de fallos por IA', '', resultado.resumen, '',
    ...(resultado.fallos.length ? [
      '| CP | Variante | Categoría | Causa probable | Siguiente paso | ¿Defecto en Jira? |', '|---|---|---|---|---|---|',
      ...resultado.fallos.map((f) => `| ${f.cp} | ${f.variante} | ${f.categoria} | ${f.causa_probable.replaceAll('|', '/')} | ${f.siguiente_paso.replaceAll('|', '/')} | ${f.crear_defecto_jira ? `Sí (${f.severidad_sugerida})` : 'No'} |`)
    ] : [])
  ].join('\n');
}

module.exports = {
  MODELO,
  AsistenteIAError,
  PropuestaCasos,
  Clasificacion,
  validarPropuesta,
  extraerFallos,
  generarCasos,
  clasificarFallos,
  aMarkdown
};
