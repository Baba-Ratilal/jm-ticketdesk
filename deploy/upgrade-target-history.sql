-- ============================================================
-- Upgrade: history of target dates (every confirmed change is kept; earlier ones are shown struck through).
-- Run ONCE in SSMS, before starting the new version. Safe to re-run. Needs the target-date and target-time scripts first.
-- ============================================================
USE TicketDesk;
GO
IF OBJECT_ID('dbo.ticket_targets') IS NULL
BEGIN
  CREATE TABLE dbo.ticket_targets (
    id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ttargets_id DEFAULT NEWID() CONSTRAINT PK_ttargets PRIMARY KEY,
    ticket_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ttargets_ticket REFERENCES dbo.tickets(id),
    target_date   DATE             NOT NULL,
    target_time   TIME(0)          NULL,
    set_by        UNIQUEIDENTIFIER NULL CONSTRAINT FK_ttargets_setby REFERENCES dbo.users(id),
    set_at        DATETIME2        NULL CONSTRAINT DF_ttargets_setat DEFAULT SYSUTCDATETIME(),
    superseded_at DATETIME2        NULL,   -- NULL = this is the current target
    superseded_by UNIQUEIDENTIFIER NULL CONSTRAINT FK_ttargets_supby REFERENCES dbo.users(id)
  );
  CREATE INDEX IX_ttargets_ticket ON dbo.ticket_targets(ticket_id);
END
GO
SELECT 'OK' AS result, OBJECT_ID('dbo.ticket_targets') AS history_table;
