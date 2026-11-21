/*
 * Módulo de IA del arnés de pruebas (Trabajo 9).
 *
 * Proveedor gratuito: Ollama (código abierto), que ejecuta el modelo en el
 * mismo equipo o en el runner de CI. No requiere cuentas, claves ni pagos.
 *
 * Dos funciones, ambas con revisión humana obligatoria:
 *  1. generarCasos: propone casos de borde que el catálogo actual no cubre.
 *  2. clasificarFallos: clasifica las variantes no aprobadas de una ejecución.
 *
 * El proveedor se inyecta, así las pruebas usan un fetch simulado (mock).
 */
const { z } = require('zod');

const MODELO_POR_DEFECTO = 'llama3.2';
const URL_POR_DEFECTO = 'http://localhost:11434';

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
  'definida, dilo en la justificación en lugar de inventarla. Responde en español y solo con el JSON pedido.'
].join(' ');

const SISTEMA_CLASIFICAR = [
  'Eres ingeniero de calidad. Recibes las variantes no aprobadas de una ejecución de pruebas funcionales',
  'de un sistema de reservas hoteleras (API Express + SQL Server). Para cada una decides si es más probable',
  'un defecto del producto, una prueba frágil, un problema de ambiente, datos de prueba incorrectos o un',
  'requisito ambiguo, explicando la evidencia que te lleva a esa conclusión. Sugiere crear un defecto en Jira',
  'solo cuando la evidencia apunta al producto. Responde en español y solo con el JSON pedido.'
].join(' ');

function esquemaJson(esquema) {
  const { $schema, ...resto } = z.toJSONSchema(esquema);
  return resto;
}

// Proveedor Ollama: POST /api/chat sin streaming, con el esquema JSON en `format`.
function crearProveedorOllama({
  url = process.env.OLLAMA_URL || URL_POR_DEFECTO,
  modelo = process.env.IA_MODELO || MODELO_POR_DEFECTO,
  fetchImpl = fetch,
  timeoutMs = 15 * 60 * 1000
} = {}) {
  return {
    nombre: 'ollama',
    modelo,
    async completarJSON({ sistema, contenido, esquema }) {
      let respuesta;
      try {
        respuesta = await fetchImpl(`${url.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: modelo,
            stream: false,
            format: esquemaJson(esquema),
            options: { temperature: 0 },
            messages: [
              { role: 'system', content: sistema },
              { role: 'user', content: contenido }
            ]
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (error) {
        throw new AsistenteIAError(
          `No se pudo conectar con Ollama en ${url} (${error.cause?.code || error.name}). ` +
          `Instálalo desde https://ollama.com/download y descarga el modelo con: ollama pull ${modelo}`
        );
      }
      if (!respuesta.ok) {
        const detalle = (await respuesta.text()).slice(0, 300);
        throw new AsistenteIAError(`Ollama respondió ${respuesta.status}: ${detalle}`);
      }
      const datos = await respuesta.json();
      let json;
      try {
        json = JSON.parse(datos.message?.content ?? '');
      } catch {
        throw new AsistenteIAError('El modelo no devolvió un JSON válido.');
      }
      // Un modelo pequeño puede apartarse del esquema: se valida antes de usarlo.
      const validado = esquema.safeParse(json);
      if (!validado.success) {
        throw new AsistenteIAError(`La respuesta no cumplió el esquema: ${validado.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      return {
        datos: validado.data,
        modelo: datos.model || modelo,
        uso: { tokens_entrada: datos.prompt_eval_count, tokens_salida: datos.eval_count }
      };
    }
  };
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

async function generarCasos({ proveedor, catalogo, hu, maximo = 8 }) {
  const historia = buscarHistoria(catalogo, hu);
  const contenido = [
    `Sistema: ${catalogo.sistema}. Dominio: ${catalogo.dominio}.`,
    `Reglas del negocio implementadas:\n- ${catalogo.reglas.join('\n- ')}`,
    `Historia ${historia.id} (${historia.jira}): ${historia.titulo}.`,
    `Criterios de aceptación:\n${Object.entries(historia.criterios).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
    `Casos existentes:\n${Object.entries(historia.casos_existentes).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
    `Propón como máximo ${maximo} casos nuevos para ${historia.id}. Usa IDs con el formato IA-${historia.id}-NN,`,
    `escribe "${historia.id}" en el campo hu y en criterio solo IDs de los criterios listados (por ejemplo "A06" o "A06 A08").`
  ].join('\n\n');
  const respuesta = await proveedor.completarJSON({ sistema: SISTEMA_GENERAR, contenido, esquema: PropuestaCasos });
  const { aceptados, descartados } = validarPropuesta(respuesta.datos.casos.slice(0, maximo), historia);
  return {
    tipo: 'generacion',
    hu: historia.id,
    jira: historia.jira,
    proveedor: proveedor.nombre,
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

async function clasificarFallos({ proveedor, reporte }) {
  const fallos = extraerFallos(reporte);
  if (fallos.length === 0) {
    // Sin fallos no se consulta la IA: no hay nada que analizar.
    return { tipo: 'clasificacion', llamada_ia: false, resumen: 'La ejecución no tiene variantes fallidas ni bloqueadas.', fallos: [] };
  }
  const contenido = [
    `Ejecución: ${reporte.ejecucion || 'sin nombre'} · Ambiente: ${reporte.ambiente ? JSON.stringify(reporte.ambiente) : 'no informado'}`,
    `Resumen: ${JSON.stringify(reporte.resumen || {})}`,
    'Variantes no aprobadas (esperado frente a observado):',
    ...fallos.map((f) => `- ${f.cp} ${f.variante} [${f.hu} · ${f.criterio}] estado=${f.estado}\n  esperado: ${f.esperado}\n  observado: ${f.observado}`)
  ].join('\n');
  const respuesta = await proveedor.completarJSON({ sistema: SISTEMA_CLASIFICAR, contenido, esquema: Clasificacion });
  return {
    tipo: 'clasificacion',
    llamada_ia: true,
    proveedor: proveedor.nombre,
    modelo: respuesta.modelo,
    ...respuesta.datos,
    uso: respuesta.uso
  };
}

function aMarkdown(resultado) {
  if (resultado.tipo === 'generacion') {
    return [
      `# Casos propuestos por IA — ${resultado.hu} (${resultado.jira})`, '',
      `Modelo: ${resultado.proveedor} / ${resultado.modelo}`, '',
      `> ${resultado.revision_humana}`, '',
      '| ID | Criterio | Técnica | Entrada | Esperado | Prioridad |', '|---|---|---|---|---|---|',
      ...resultado.casos.map((c) => `| ${c.id_propuesto} | ${c.criterio} | ${c.tecnica} | ${c.entrada.replaceAll('|', '/')} | ${c.resultado_esperado.replaceAll('|', '/')} | ${c.prioridad} |`),
      '', `Descartados por la validación del arnés: ${resultado.descartados_por_validacion.length}`,
      ...resultado.descartados_por_validacion.map((c) => `- ${c.id_propuesto}: ${c.motivos.join('; ')}`)
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
  MODELO_POR_DEFECTO,
  AsistenteIAError,
  PropuestaCasos,
  Clasificacion,
  crearProveedorOllama,
  validarPropuesta,
  extraerFallos,
  generarCasos,
  clasificarFallos,
  aMarkdown
};
