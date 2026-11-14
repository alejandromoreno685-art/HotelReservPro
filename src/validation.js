const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// Los identificadores de la base son UNIQUEIDENTIFIER. Validarlos antes de
// consultar evita que un valor mal formado llegue a SQL Server (error 8169).
function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value.trim());
}

const requestKeyPattern = /^[A-Za-z0-9._:-]{1,100}$/;

function isRequestKey(value) {
  return typeof value === 'string' && requestKeyPattern.test(value);
}

module.exports = { isUuid, isRequestKey };
