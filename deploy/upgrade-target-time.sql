-- ============================================================
-- Upgrade: optional target TIME on tickets (next to the target date). Run ONCE in SSMS, before starting the new version.
-- Safe to re-run. Needs deploy\upgrade-target-date.sql to have been run first.
-- ============================================================
USE TicketDesk;
GO
IF COL_LENGTH('dbo.tickets','target_time') IS NULL
  ALTER TABLE dbo.tickets ADD target_time TIME(0) NULL;
GO
SELECT 'OK' AS result, COL_LENGTH('dbo.tickets','target_time') AS target_time_column;
