-- ============================================================
-- JM TicketDesk — one-time database setup (Windows authentication)
-- Run in SSMS as a sysadmin, connected to the instance that will hold the database.
-- This creates a SEPARATE database and gives ONE Windows account access to ONLY that database.
-- It does not touch the HRMS database and needs no SQL password and no restart.
--
-- 1) Check the account name below. The app runs as SYSTEM (see deploy\install-task.ps1).
-- 2) Run this file.  3) Then run schema.sql with the TicketDesk database selected.
-- ============================================================

CREATE DATABASE TicketDesk;
GO

-- The Windows account the app runs under. Skipped if the login already exists.
IF SUSER_ID(N'NT AUTHORITY\SYSTEM') IS NULL
  CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS;
GO

USE TicketDesk;
GO

CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
ALTER ROLE db_datareader ADD MEMBER [NT AUTHORITY\SYSTEM];
ALTER ROLE db_datawriter ADD MEMBER [NT AUTHORITY\SYSTEM];
GO
