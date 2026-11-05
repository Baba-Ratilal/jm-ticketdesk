-- ============================================================
-- Upgrade: admin-created users with a forced password change, and the Issues board.
-- Run ONCE in SSMS (it switches to TicketDesk itself). Safe to re-run.
-- Run it BEFORE starting the new version of the app. Needs no restart.
-- ============================================================
USE TicketDesk;
GO

IF COL_LENGTH('dbo.users','must_change_password') IS NULL
  ALTER TABLE dbo.users ADD must_change_password BIT NOT NULL CONSTRAINT DF_users_mustchg DEFAULT 0;
GO

IF OBJECT_ID('dbo.issues') IS NULL
BEGIN
  CREATE TABLE dbo.issues (
    id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_issues_id DEFAULT NEWID() CONSTRAINT PK_issues PRIMARY KEY,
    issue_no    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT UQ_issues_no UNIQUE,
    type        NVARCHAR(10)   NOT NULL CONSTRAINT CK_issues_type CHECK (type IN ('IT','ERP')),
    title       NVARCHAR(150)  NOT NULL,
    description NVARCHAR(MAX)  NOT NULL CONSTRAINT DF_issues_desc DEFAULT '',
    priority    NVARCHAR(10)   NOT NULL CONSTRAINT DF_issues_priority DEFAULT 'Medium'
                CONSTRAINT CK_issues_priority CHECK (priority IN ('Low','Medium','High','Critical')),
    status      NVARCHAR(20)   NOT NULL CONSTRAINT DF_issues_status DEFAULT 'Open'
                CONSTRAINT CK_issues_status CHECK (status IN ('Open','In Progress','On Hold','Resolved','Closed')),
    erp_module  NVARCHAR(100)  NULL,
    created_by  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_issues_created_by REFERENCES dbo.users(id),
    assigned_to UNIQUEIDENTIFIER NULL CONSTRAINT FK_issues_assigned_to REFERENCES dbo.users(id),
    created_at  DATETIME2      NOT NULL CONSTRAINT DF_issues_created DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2      NOT NULL CONSTRAINT DF_issues_updated DEFAULT SYSUTCDATETIME(),
    resolved_at DATETIME2      NULL
  );
  CREATE INDEX IX_issues_status      ON dbo.issues(status);
  CREATE INDEX IX_issues_assigned_to ON dbo.issues(assigned_to);
END
GO

IF OBJECT_ID('dbo.issue_comments') IS NULL
BEGIN
  CREATE TABLE dbo.issue_comments (
    id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_icomments_id DEFAULT NEWID() CONSTRAINT PK_icomments PRIMARY KEY,
    issue_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_icomments_issue REFERENCES dbo.issues(id),
    author_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_icomments_author REFERENCES dbo.users(id),
    body       NVARCHAR(MAX)    NOT NULL,
    created_at DATETIME2        NOT NULL CONSTRAINT DF_icomments_created DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_icomments_issue ON dbo.issue_comments(issue_id);
END
GO

IF OBJECT_ID('dbo.issue_tickets') IS NULL
BEGIN
  CREATE TABLE dbo.issue_tickets (
    issue_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_itickets_issue REFERENCES dbo.issues(id),
    ticket_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_itickets_ticket REFERENCES dbo.tickets(id),
    linked_by  UNIQUEIDENTIFIER NULL CONSTRAINT FK_itickets_user REFERENCES dbo.users(id),
    created_at DATETIME2        NOT NULL CONSTRAINT DF_itickets_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_issue_tickets PRIMARY KEY (issue_id, ticket_id)
  );
  CREATE INDEX IX_itickets_ticket ON dbo.issue_tickets(ticket_id);
END
GO

IF OBJECT_ID('dbo.issue_events') IS NULL
BEGIN
  CREATE TABLE dbo.issue_events (
    id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ievents_id DEFAULT NEWID() CONSTRAINT PK_ievents PRIMARY KEY,
    issue_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ievents_issue REFERENCES dbo.issues(id),
    actor_id   UNIQUEIDENTIFIER NULL CONSTRAINT FK_ievents_actor REFERENCES dbo.users(id),
    action     NVARCHAR(30)     NOT NULL,
    detail     NVARCHAR(300)    NULL,
    created_at DATETIME2        NOT NULL CONSTRAINT DF_ievents_created DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_ievents_issue ON dbo.issue_events(issue_id);
END
GO

SELECT 'OK' AS result,
       (SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'issue%') AS issue_tables,
       COL_LENGTH('dbo.users','must_change_password') AS must_change_column;
