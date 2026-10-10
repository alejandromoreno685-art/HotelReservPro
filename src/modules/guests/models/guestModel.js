const { randomUUID } = require('node:crypto');
const database = require('../../../database');

const testMode = process.env.NODE_ENV === 'test';
const guests = new Map();

function mapGuest(row) {
  return {
    id: row.id,
    fullName: row.fullName,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    phone: row.phone,
    email: row.email,
    country: row.country,
    foreignNonResident: Boolean(row.foreignNonResident),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
  };
}

const guestColumns = `id, full_name AS fullName, document_type AS documentType,
  document_number AS documentNumber, phone, email, country,
  foreign_non_resident AS foreignNonResident, created_at AS createdAt, updated_at AS updatedAt`;

function matches(guest, filters) {
  const search = (filters.search || '').toLocaleLowerCase();
  return !search || [
    guest.fullName,
    guest.documentNumber,
    guest.email,
    guest.phone
  ].some((field) => field.toLocaleLowerCase().includes(search));
}

async function list(filters = {}) {
  if (!testMode) {
    const search = (filters.search || '').trim();
    const result = await database.query(
      `SELECT ${guestColumns}
       FROM dbo.Guests
       ${search ? `WHERE full_name LIKE @search OR document_number LIKE @search
         OR email LIKE @search OR phone LIKE @search` : ''}
       ORDER BY full_name`,
      search ? { search: `%${search}%` } : {}
    );
    return result.recordset.map(mapGuest);
  }

  return [...guests.values()]
    .filter((guest) => matches(guest, filters))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es'))
    .map((guest) => ({ ...guest }));
}

async function findById(id) {
  if (!testMode) {
    const result = await database.query(
      `SELECT ${guestColumns} FROM dbo.Guests WHERE id = @id`,
      { id }
    );
    return result.recordset.length ? mapGuest(result.recordset[0]) : null;
  }

  const guest = guests.get(id);
  return guest ? { ...guest } : null;
}

async function findByDocument(documentType, documentNumber) {
  if (!testMode) {
    const result = await database.query(
      'SELECT id FROM dbo.Guests WHERE document_type = @documentType AND document_number = @documentNumber',
      { documentType, documentNumber }
    );
    return result.recordset[0] || null;
  }

  const guest = [...guests.values()].find(
    (item) => item.documentType === documentType && item.documentNumber === documentNumber
  );
  return guest ? { ...guest } : null;
}

async function create(data) {
  const id = randomUUID();
  if (!testMode) {
    await database.query(
      `INSERT INTO dbo.Guests
        (id, full_name, document_type, document_number, phone, email, country, foreign_non_resident)
       VALUES (@id, @fullName, @documentType, @documentNumber, @phone, @email, @country, @foreignNonResident)`,
      { id, ...data }
    );
    return findById(id);
  }

  const now = new Date().toISOString();
  const guest = { id, ...data, createdAt: now, updatedAt: now };
  guests.set(id, guest);
  return { ...guest };
}

async function update(id, data) {
  if (!testMode) {
    const result = await database.query(
      `UPDATE dbo.Guests
       SET full_name = @fullName, document_type = @documentType,
           document_number = @documentNumber, phone = @phone, email = @email,
           country = @country, foreign_non_resident = @foreignNonResident,
           updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      { id, ...data }
    );
    if (result.rowsAffected[0] === 0) return null;
    return findById(id);
  }

  const current = guests.get(id);
  if (!current) return null;
  const guest = { ...current, ...data, updatedAt: new Date().toISOString() };
  guests.set(id, guest);
  return { ...guest };
}

async function remove(id) {
  const guest = await findById(id);
  if (!guest) return null;
  if (!testMode) {
    await database.query('DELETE FROM dbo.Guests WHERE id = @id', { id });
    return guest;
  }

  guests.delete(id);
  return guest;
}

module.exports = { list, findById, findByDocument, create, update, remove };
