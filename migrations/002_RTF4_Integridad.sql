-- Migración aditiva RTF4 (002). No borra ni modifica datos existentes.
-- Ejecutar con sqlcmd -I (QUOTED_IDENTIFIER ON) o desde SSMS.
-- Selecciona expresamente la base exclusiva de pruebas; para otra base,
-- revise primero el bloque de verificación de duplicados.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
USE [HotelReservePro_Test];
GO

-- 1. Clave de solicitud en consumos y anticipos para evitar duplicados por
--    doble clic o reintento (idempotencia persistida).
IF COL_LENGTH(N'dbo.ReservationCharges', N'request_key') IS NULL
  ALTER TABLE dbo.ReservationCharges ADD request_key VARCHAR(100) NULL;
GO
IF COL_LENGTH(N'dbo.ReservationPayments', N'request_key') IS NULL
  ALTER TABLE dbo.ReservationPayments ADD request_key VARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ReservationCharges_RequestKey')
  CREATE UNIQUE INDEX UX_ReservationCharges_RequestKey
    ON dbo.ReservationCharges (request_key) WHERE request_key IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ReservationPayments_RequestKey')
  CREATE UNIQUE INDEX UX_ReservationPayments_RequestKey
    ON dbo.ReservationPayments (request_key) WHERE request_key IS NOT NULL;
GO

-- 2. Defensa en la base de datos: dos reservas activas de la misma habitación
--    no pueden comenzar el mismo día. La regla completa de cruces la valida la
--    aplicación dentro de una transacción serializable; este índice cubre el
--    caso más directo aunque la validación de la aplicación fallara.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Reservations_Room_CheckIn_Active')
BEGIN
  IF EXISTS (
    SELECT room_id, check_in FROM dbo.Reservations
    WHERE status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
    GROUP BY room_id, check_in HAVING COUNT(*) > 1
  )
    PRINT 'AVISO: existen reservas activas duplicadas; revise los datos antes de crear UX_Reservations_Room_CheckIn_Active.';
  ELSE
    CREATE UNIQUE INDEX UX_Reservations_Room_CheckIn_Active
      ON dbo.Reservations (room_id, check_in)
      WHERE status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS');
END;
GO
