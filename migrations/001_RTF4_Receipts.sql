USE [HotelReservePro_Test];
GO

IF OBJECT_ID(N'dbo.CK_Users_Role', N'C') IS NOT NULL
  ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Role;
ALTER TABLE dbo.Users WITH CHECK
  ADD CONSTRAINT CK_Users_Role CHECK (role IN ('ADMIN', 'RECEPTIONIST', 'RECEPCION', 'CONSULTA'));
GO

-- La columna se agrega en un lote y se llena en otro: SQL Server no compila
-- un UPDATE sobre una columna creada en el mismo lote.
IF COL_LENGTH(N'dbo.Reservations', N'rate_per_night') IS NULL
  ALTER TABLE dbo.Reservations ADD rate_per_night DECIMAL(12, 0) NULL;
GO

UPDATE reservation
  SET rate_per_night = room.rate
FROM dbo.Reservations AS reservation
JOIN dbo.Rooms AS room ON room.id = reservation.room_id
WHERE reservation.rate_per_night IS NULL;
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Reservations') AND name = N'rate_per_night' AND is_nullable = 1
)
  ALTER TABLE dbo.Reservations ALTER COLUMN rate_per_night DECIMAL(12, 0) NOT NULL;
GO

IF OBJECT_ID(N'dbo.ReservationRequests', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ReservationRequests (
    idempotency_key VARCHAR(100) NOT NULL CONSTRAINT PK_ReservationRequests PRIMARY KEY,
    reservation_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_ReservationRequests_Reservation UNIQUE,
    request_fingerprint CHAR(64) NOT NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_ReservationRequests_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ReservationRequests_Reservations FOREIGN KEY (reservation_id) REFERENCES dbo.Reservations(id)
  );
END;
GO

IF OBJECT_ID(N'dbo.ReservationCharges', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ReservationCharges (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ReservationCharges PRIMARY KEY,
    reservation_id UNIQUEIDENTIFIER NOT NULL,
    description NVARCHAR(160) NOT NULL,
    amount DECIMAL(12, 0) NOT NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_ReservationCharges_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ReservationCharges_Reservations FOREIGN KEY (reservation_id) REFERENCES dbo.Reservations(id),
    CONSTRAINT CK_ReservationCharges_Amount CHECK (amount > 0)
  );
END;
GO

IF OBJECT_ID(N'dbo.ReservationPayments', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ReservationPayments (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ReservationPayments PRIMARY KEY,
    reservation_id UNIQUEIDENTIFIER NOT NULL,
    description NVARCHAR(160) NOT NULL,
    amount DECIMAL(12, 0) NOT NULL,
    received_at DATETIME2(0) NOT NULL CONSTRAINT DF_ReservationPayments_ReceivedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ReservationPayments_Reservations FOREIGN KEY (reservation_id) REFERENCES dbo.Reservations(id),
    CONSTRAINT CK_ReservationPayments_Amount CHECK (amount > 0)
  );
END;
GO
