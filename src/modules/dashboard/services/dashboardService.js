const dashboardModel = require('../models/dashboardModel');
const roomService = require('../../rooms/services/roomService');
const reservationModel = require('../../reservations/models/reservationModel');

// El panel usa las mismas consultas que reservas y habitaciones para que los
// números coincidan con lo que muestran esos módulos.
async function getSummary() {
  const reservations = await reservationModel.list();
  const recentActivity = [...reservations]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, 5)
    .map(({ id, guestName, roomNumber, checkIn, checkOut, status, createdAt }) => ({
      id, guestName, roomNumber, checkIn, checkOut, status, createdAt
    }));
  return {
    ...dashboardModel.getSummary(),
    ...await reservationModel.getSummary(),
    ...await roomService.getCounts(),
    recentActivity
  };
}

module.exports = { getSummary };
