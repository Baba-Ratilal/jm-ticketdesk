-- ============================================================
-- Upgrade: Task Manager (tasks, target-date history, reporting hierarchy, "task source" master).
-- Run ONCE in SSMS BEFORE deploying the new version, AFTER upgrade-masters.sql. Safe to re-run.
-- ============================================================
USE TicketDesk;
GO
-- who each person reports to (a manager sees everything below them)
IF COL_LENGTH('dbo.users','manager_id') IS NULL
  ALTER TABLE dbo.users ADD manager_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_users_manager REFERENCES dbo.users(id);
GO
-- allow the new "task_source" list in the masters table
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_masters_kind')
  ALTER TABLE dbo.masters DROP CONSTRAINT CK_masters_kind;
GO
ALTER TABLE dbo.masters ADD CONSTRAINT CK_masters_kind
  CHECK (kind IN ('unit','department','designation','it_category','erp_category','erp_module','task_source'));
GO
IF OBJECT_ID('dbo.tasks') IS NULL
BEGIN
  CREATE TABLE dbo.tasks (
    id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_tasks_id DEFAULT NEWID() CONSTRAINT PK_tasks PRIMARY KEY,
    task_no     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT UQ_tasks_no UNIQUE,
    task        NVARCHAR(1000) NOT NULL,
    given_date  DATE NOT NULL CONSTRAINT DF_tasks_given DEFAULT CAST(DATEADD(minute, 330, SYSUTCDATETIME()) AS date),
    assigned_to UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_tasks_to REFERENCES dbo.users(id),
    assigned_by UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_tasks_by REFERENCES dbo.users(id),
    source      NVARCHAR(100) NULL,
    target_date DATE NULL,
    status      NVARCHAR(20) NOT NULL CONSTRAINT DF_tasks_status DEFAULT 'Open'
                CONSTRAINT CK_tasks_status CHECK (status IN ('Open','In Progress','Done','Not mine')),
    remark      NVARCHAR(1000) NULL,
    done_date   DATE NULL,
    created_at  DATETIME2 NOT NULL CONSTRAINT DF_tasks_created DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2 NOT NULL CONSTRAINT DF_tasks_updated DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_tasks_to ON dbo.tasks(assigned_to, status);
  CREATE INDEX IX_tasks_by ON dbo.tasks(assigned_by);
END
GO
IF OBJECT_ID('dbo.task_events') IS NULL
BEGIN
  CREATE TABLE dbo.task_events (
    id         BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_task_events PRIMARY KEY,
    task_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_task_events_task REFERENCES dbo.tasks(id),
    actor_id   UNIQUEIDENTIFIER NULL,
    kind       NVARCHAR(20) NOT NULL,           -- created | target | status | remark | edited
    old_value  NVARCHAR(1000) NULL,
    new_value  NVARCHAR(1000) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_task_events_created DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_task_events_task ON dbo.task_events(task_id, created_at);
END
GO
INSERT INTO dbo.masters (kind, value, sort_order)
SELECT 'task_source', v.value, v.o FROM (VALUES
  ('QBR',10),('MBR',20),('Annual Business Review',30),('Weekly Review',40),('Daily Review (LHS)',50),('Management Meeting',60),('Audit',70),('Other',80)
) AS v(value, o)
WHERE NOT EXISTS (SELECT 1 FROM dbo.masters m WHERE m.kind='task_source' AND m.value=v.value);
GO
SELECT 'OK' AS result, OBJECT_ID('dbo.tasks') AS tasks_table, COL_LENGTH('dbo.users','manager_id') AS manager_col;
