-- ============================================================
-- Upgrade for databases created BEFORE the "user ID login + Windows authentication" version.
-- Run ONCE in SSMS, connected to the instance, with the TicketDesk database selected
-- (or just run it: it switches to TicketDesk itself). Safe to re-run.
-- Run it BEFORE starting the new version of the app.
-- ============================================================
USE TicketDesk;
GO

-- 1) users: new columns
IF COL_LENGTH('dbo.users','login_id') IS NULL         ALTER TABLE dbo.users ADD login_id NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.users','source') IS NULL           ALTER TABLE dbo.users ADD source NVARCHAR(10) NOT NULL CONSTRAINT DF_users_source DEFAULT 'local';
IF COL_LENGTH('dbo.users','password_hash') IS NULL    ALTER TABLE dbo.users ADD password_hash NVARCHAR(300) NULL;
IF COL_LENGTH('dbo.users','erp_secret') IS NULL       ALTER TABLE dbo.users ADD erp_secret NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.users','erp_synced_at') IS NULL    ALTER TABLE dbo.users ADD erp_synced_at DATETIME2 NULL;
IF COL_LENGTH('dbo.users','failed_attempts') IS NULL  ALTER TABLE dbo.users ADD failed_attempts INT NOT NULL CONSTRAINT DF_users_failed DEFAULT 0;
IF COL_LENGTH('dbo.users','locked_until') IS NULL     ALTER TABLE dbo.users ADD locked_until DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_users_source')
  ALTER TABLE dbo.users ADD CONSTRAINT CK_users_source CHECK (source IN ('local','erp'));
GO

-- 2) email is now optional (ERP users may not have one); uniqueness only applies to filled-in values
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_users_email')
  ALTER TABLE dbo.users DROP CONSTRAINT UQ_users_email;
GO
ALTER TABLE dbo.users ALTER COLUMN email NVARCHAR(256) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_users_email')
  CREATE UNIQUE INDEX UX_users_email ON dbo.users(email) WHERE email IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_users_login_id')
  CREATE UNIQUE INDEX UX_users_login_id ON dbo.users(login_id) WHERE login_id IS NOT NULL;
GO

-- 3) Windows authentication: give the account the app runs under (SYSTEM) access to this database only.
IF SUSER_ID(N'NT AUTHORITY\SYSTEM') IS NULL
  CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS;
GO
IF USER_ID(N'NT AUTHORITY\SYSTEM') IS NULL
  CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
GO
ALTER ROLE db_datareader ADD MEMBER [NT AUTHORITY\SYSTEM];
ALTER ROLE db_datawriter ADD MEMBER [NT AUTHORITY\SYSTEM];
GO

-- 4) The SQL login is no longer needed. Remove it once the app works with Windows authentication:
--    DROP USER ticketdesk_app;   DROP LOGIN ticketdesk_app;
