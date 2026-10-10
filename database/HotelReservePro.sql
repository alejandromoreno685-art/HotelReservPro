USE [master];
GO

IF DB_ID(N'HotelReservePro') IS NULL
BEGIN
  CREATE DATABASE [HotelReservePro];
END;
GO

IF SUSER_ID(N'hotelreserve_app') IS NULL
BEGIN
  CREATE LOGIN [hotelreserve_app]
    WITH PASSWORD = N'REPLACE_WITH_A_STRONG_PASSWORD';
END;
GO

USE [HotelReservePro];
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
    CONSTRAINT CK_Users_Role CHECK (role IN ('ADMIN', 'RECEPTIONIST'))
  );
END;
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
