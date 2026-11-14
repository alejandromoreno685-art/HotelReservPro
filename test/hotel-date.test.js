const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hotelTimeZone, hotelToday } = require('../src/hotelDate');

test('interprets the hotel business day in America/Bogota', () => {
  assert.equal(hotelTimeZone, 'America/Bogota');
  assert.equal(hotelToday(new Date('2026-11-14T03:30:00.000Z')), '2026-11-13');
  assert.equal(hotelToday(new Date('2026-11-14T05:00:00.000Z')), '2026-11-14');
});
