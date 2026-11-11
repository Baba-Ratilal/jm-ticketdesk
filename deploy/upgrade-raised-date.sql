-- ============================================================
-- Upgrade: a "Date" picked when raising a ticket or an issue. Run ONCE in SSMS BEFORE the new version. Safe to re-run.
-- Existing rows get the date they were created (India time).
-- ============================================================
USE TicketDesk;
GO
IF COL_LENGTH('dbo.tickets','raised_date') IS NULL
  ALTER TABLE dbo.tickets ADD raised_date DATE NULL;
GO
IF COL_LENGTH('dbo.issues','raised_date') IS NULL
  ALTER TABLE dbo.issues ADD raised_date DATE NULL;
GO
UPDATE dbo.tickets SET raised_date = CAST(DATEADD(minute, 330, created_at) AS date) WHERE raised_date IS NULL;
UPDATE dbo.issues  SET raised_date = CAST(DATEADD(minute, 330, created_at) AS date) WHERE raised_date IS NULL;
GO
SELECT 'OK' AS result, COL_LENGTH('dbo.tickets','raised_date') AS tickets_col, COL_LENGTH('dbo.issues','raised_date') AS issues_col;
