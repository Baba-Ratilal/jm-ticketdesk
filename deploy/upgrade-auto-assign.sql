-- ============================================================
-- Upgrade: default assignee per ticket type (IT / ERP). Run ONCE in SSMS, before starting the new version. Safe to re-run.
-- ============================================================
USE TicketDesk;
GO
IF OBJECT_ID('dbo.settings') IS NULL
  CREATE TABLE dbo.settings (
    k          NVARCHAR(50)  NOT NULL CONSTRAINT PK_settings PRIMARY KEY,
    v          NVARCHAR(200) NULL,
    updated_at DATETIME2     NOT NULL CONSTRAINT DF_settings_updated DEFAULT SYSUTCDATETIME()
  );
GO
SELECT 'OK' AS result, OBJECT_ID('dbo.settings') AS settings_table;
