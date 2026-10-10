function getSummary() {
  return {
    reservationsToday: 0,
    pendingReservations: 0,
    availableRooms: 0,
    occupiedRooms: 0,
    maintenanceRooms: 0,
    pendingPayments: 0,
    recordedIncome: 0,
    recentActivity: []
  };
}

module.exports = { getSummary };
