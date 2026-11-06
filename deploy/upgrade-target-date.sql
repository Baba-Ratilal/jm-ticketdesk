-- ============================================================
-- Upgrade: target date on tickets (set by the IT team / admins) for the dashboard and on-time delivery %.
-- Run ONCE in SSMS, before starting the new version. Safe to re-run. No restart needed.
-- ============================================================
USE TicketDesk;
GO
IF COL_LENGTH('dbo.tickets','target_date') IS NULL
  ALTER TABLE dbo.tickets ADD target_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tickets_target_date')
  CREATE INDEX IX_tickets_target_date ON dbo.tickets(target_date);
GO
SELECT 'OK' AS result, COL_LENGTH('dbo.tickets','target_date') AS target_date_column;
