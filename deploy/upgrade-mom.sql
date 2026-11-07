-- ============================================================
-- Upgrade: MOM (minutes of meeting) action points. Run ONCE in SSMS before the new version. Safe to re-run.
-- ============================================================
USE TicketDesk;
GO
IF OBJECT_ID('dbo.mom_points') IS NULL
BEGIN
  CREATE TABLE dbo.mom_points (
    id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_mom_id DEFAULT NEWID() CONSTRAINT PK_mom PRIMARY KEY,
    sr_no       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT UQ_mom_sr UNIQUE,
    mom_date    DATE            NOT NULL,
    point       NVARCHAR(1000)  NOT NULL,
    target_date DATE            NULL,
    status      NVARCHAR(20)    NOT NULL CONSTRAINT DF_mom_status DEFAULT 'Open'
                CONSTRAINT CK_mom_status CHECK (status IN ('Open','In Progress','On Hold','Done')),
    assigned_to UNIQUEIDENTIFIER NULL CONSTRAINT FK_mom_assigned REFERENCES dbo.users(id),
    remark      NVARCHAR(1000)  NULL,
    created_by  UNIQUEIDENTIFIER NULL CONSTRAINT FK_mom_created REFERENCES dbo.users(id),
    created_at  DATETIME2       NOT NULL CONSTRAINT DF_mom_created DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2       NOT NULL CONSTRAINT DF_mom_updated DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_mom_status ON dbo.mom_points(status);
END
GO
SELECT 'OK' AS result, OBJECT_ID('dbo.mom_points') AS mom_table;
