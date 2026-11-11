-- ============================================================
-- Upgrade: closing date on tickets and issues. Run ONCE in SSMS BEFORE the new version, and AFTER upgrade-raised-date.sql. Safe to re-run.
-- Items already Resolved/Closed get the date they were resolved (India time).
-- ============================================================
USE TicketDesk;
GO
IF COL_LENGTH('dbo.tickets','closed_date') IS NULL
  ALTER TABLE dbo.tickets ADD closed_date DATE NULL;
GO
IF COL_LENGTH('dbo.issues','closed_date') IS NULL
  ALTER TABLE dbo.issues ADD closed_date DATE NULL;
GO
UPDATE dbo.tickets SET closed_date = CAST(DATEADD(minute, 330, resolved_at) AS date) WHERE closed_date IS NULL AND resolved_at IS NOT NULL AND status IN ('Resolved','Closed');
UPDATE dbo.issues  SET closed_date = CAST(DATEADD(minute, 330, resolved_at) AS date) WHERE closed_date IS NULL AND resolved_at IS NOT NULL AND status IN ('Resolved','Closed');
GO
SELECT 'OK' AS result, COL_LENGTH('dbo.tickets','closed_date') AS tickets_col, COL_LENGTH('dbo.issues','closed_date') AS issues_col;
