:setvar DatabaseName "HotelReservePro"
USE [master];
GO

IF DB_ID(N'$(DatabaseName)') IS NULL
BEGIN
  CREATE DATABASE [$(DatabaseName)];
END;
GO

IF SUSER_ID(N'hotelreserve_app') IS NULL
BEGIN
  CREATE LOGIN [hotelreserve_app]
    WITH PASSWORD = N'REPLACE_WITH_A_STRONG_PASSWORD';
END;
GO

USE [$(DatabaseName)];
GO

IF USER_ID(N'hotelreserve_app') IS NULL
BEGIN
  CREATE USER [hotelreserve_app] FOR LOGIN [hotelreserve_app];
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.database_role_members AS drm
  JOIN sys.database_principals AS role_principal ON role_principal.principal_id = drm.role_principal_id
  JOIN sys.database_principals AS user_principal ON user_principal.principal_id = drm.member_principal_id
  WHERE role_principal.name = N'db_datareader'
    AND user_principal.name = N'hotelreserve_app'
)
  ALTER ROLE [db_datareader] ADD MEMBER [hotelreserve_app];

IF NOT EXISTS (
  SELECT 1
  FROM sys.database_role_members AS drm
  JOIN sys.database_principals AS role_principal ON role_principal.principal_id = drm.role_principal_id
  JOIN sys.database_principals AS user_principal ON user_principal.principal_id = drm.member_principal_id
  WHERE role_principal.name = N'db_datawriter'
    AND user_principal.name = N'hotelreserve_app'
)
  ALTER ROLE [db_datawriter] ADD MEMBER [hotelreserve_app];
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Users (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    username NVARCHAR(80) NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
    display_name NVARCHAR(160) NOT NULL,
    password_salt VARBINARY(16) NOT NULL,
    password_hash VARBINARY(64) NOT NULL,
    role VARCHAR(20) NOT NULL CONSTRAINT DF_Users_Role DEFAULT 'RECEPTIONIST',
    active BIT NOT NULL CONSTRAINT DF_Users_Active DEFAULT 1,
    failed_login_attempts INT NOT NULL CONSTRAINT DF_Users_FailedAttempts DEFAULT 0,
    locked_until DATETIME2(0) NULL,
    last_login_at DATETIME2(0) NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Users_Role CHECK (role IN ('ADMIN', 'RECEPTIONIST', 'RECEPCION', 'CONSULTA'))
  );
END;
GO

IF OBJECT_ID(N'dbo.CK_Users_Role', N'C') IS NOT NULL
  ALTER TABLE dbo.Users DROP CONSTRAINT CK_Users_Role;
ALTER TABLE dbo.Users WITH CHECK
  ADD CONSTRAINT CK_Users_Role CHECK (role IN ('ADMIN', 'RECEPTIONIST', 'RECEPCION', 'CONSULTA'));
GO

IF OBJECT_ID(N'dbo.Guests', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Guests (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Guests PRIMARY KEY,
    full_name NVARCHAR(160) NOT NULL,
    document_type VARCHAR(20) NOT NULL,
    document_number NVARCHAR(40) NOT NULL,
    phone NVARCHAR(30) NOT NULL,
    email NVARCHAR(254) NOT NULL,
    country NVARCHAR(100) NOT NULL,
    foreign_non_resident BIT NOT NULL CONSTRAINT DF_Guests_ForeignNonResident DEFAULT 0,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_Guests_CreatedAt DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_Guests_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Guests_Document UNIQUE (document_type, document_number)
  );
END;
GO

IF OBJECT_ID(N'dbo.Rooms', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Rooms (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Rooms PRIMARY KEY,
    room_number NVARCHAR(12) NOT NULL CONSTRAINT UQ_Rooms_Number UNIQUE,
    room_type VARCHAR(20) NOT NULL,
    capacity TINYINT NOT NULL,
    rate DECIMAL(12, 0) NOT NULL,
    physical_status VARCHAR(30) NOT NULL,
    description NVARCHAR(250) NOT NULL CONSTRAINT DF_Rooms_Description DEFAULT N'',
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_Rooms_CreatedAt DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_Rooms_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Rooms_Capacity CHECK (capacity BETWEEN 1 AND 12),
    CONSTRAINT CK_Rooms_Rate CHECK (rate > 0),
    CONSTRAINT CK_Rooms_Type CHECK (room_type IN ('ESTANDAR', 'DOBLE', 'FAMILIAR', 'SUITE')),
    CONSTRAINT CK_Rooms_Status CHECK (physical_status IN ('DISPONIBLE', 'EN_LIMPIEZA', 'MANTENIMIENTO', 'FUERA_DE_SERVICIO'))
  );
END;
GO

IF OBJECT_ID(N'dbo.Reservations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Reservations (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Reservations PRIMARY KEY,
    guest_id UNIQUEIDENTIFIER NOT NULL,
    room_id UNIQUEIDENTIFIER NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    guest_count TINYINT NOT NULL,
    rate_per_night DECIMAL(12, 0) NOT NULL,
    status VARCHAR(30) NOT NULL CONSTRAINT DF_Reservations_Status DEFAULT 'PENDING_DEPOSIT',
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_Reservations_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Reservations_Guests FOREIGN KEY (guest_id) REFERENCES dbo.Guests(id),
    CONSTRAINT FK_Reservations_Rooms FOREIGN KEY (room_id) REFERENCES dbo.Rooms(id),
    CONSTRAINT CK_Reservations_Dates CHECK (check_out > check_in),
    CONSTRAINT CK_Reservations_GuestCount CHECK (guest_count BETWEEN 1 AND 12),
    CONSTRAINT CK_Reservations_Status CHECK (status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
  );
END;
GO

IF COL_LENGTH(N'dbo.Reservations', N'guest_count') IS NULL
BEGIN
  ALTER TABLE dbo.Reservations ADD guest_count TINYINT NOT NULL
    CONSTRAINT DF_Reservations_GuestCount DEFAULT 1;
END;
GO

-- La columna se agrega en un lote y se llena en otro: SQL Server no compila
-- un UPDATE sobre una columna creada en el mismo lote.
IF COL_LENGTH(N'dbo.Reservations', N'rate_per_night') IS NULL
  ALTER TABLE dbo.Reservations ADD rate_per_night DECIMAL(12, 0) NULL;
GO

UPDATE res
  SET rate_per_night = room.rate
FROM dbo.Reservations AS res
JOIN dbo.Rooms AS room ON room.id = res.room_id
WHERE res.rate_per_night IS NULL;
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Reservations') AND name = N'rate_per_night' AND is_nullable = 1
)
  ALTER TABLE dbo.Reservations ALTER COLUMN rate_per_night DECIMAL(12, 0) NOT NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_Reservations_GuestCount'
    AND parent_object_id = OBJECT_ID(N'dbo.Reservations')
)
BEGIN
  ALTER TABLE dbo.Reservations WITH CHECK
    ADD CONSTRAINT CK_Reservations_GuestCount CHECK (guest_count BETWEEN 1 AND 12);
END;
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

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Reservations_Room_Dates_Status'
    AND object_id = OBJECT_ID(N'dbo.Reservations')
)
BEGIN
  CREATE INDEX IX_Reservations_Room_Dates_Status
    ON dbo.Reservations (room_id, status, check_in, check_out);
END;
GO

-- RTF4: equivalente a migrations/002_RTF4_Integridad.sql (aditivo)
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
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
