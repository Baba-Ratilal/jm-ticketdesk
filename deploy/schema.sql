-- ============================================================
-- JM TicketDesk (office server) — tables
-- Run this in SSMS while connected to the TicketDesk database
-- (after running sql-setup.sql). Safe to run once on an empty database.
-- ============================================================

CREATE TABLE dbo.users (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_users_id DEFAULT NEWID() CONSTRAINT PK_users PRIMARY KEY,
  login_id    NVARCHAR(100)    NULL,        -- the ERP user ID people sign in with; always lower case
  email       NVARCHAR(256)    NULL,        -- optional; only used for email alerts; always lower case
  full_name   NVARCHAR(200)    NULL,
  role        NVARCHAR(10)     NOT NULL CONSTRAINT DF_users_role DEFAULT 'user'
              CONSTRAINT CK_users_role CHECK (role IN ('user','agent','admin')),   -- agent = IT team member
  phone       NVARCHAR(20)     NULL,        -- shown to the requester when a ticket is assigned
  unit        NVARCHAR(100)    NULL,
  department  NVARCHAR(100)    NULL,
  active      BIT              NOT NULL CONSTRAINT DF_users_active DEFAULT 1,
  source      NVARCHAR(10)     NOT NULL CONSTRAINT DF_users_source DEFAULT 'local'
              CONSTRAINT CK_users_source CHECK (source IN ('local','erp')),        -- erp = kept in step by the nightly sync
  password_hash   NVARCHAR(300) NULL,       -- TicketDesk's own salted hash (never the password itself)
  erp_secret      NVARCHAR(500) NULL,       -- the ERP's own stored hash, when it only gives us a hash
  erp_synced_at   DATETIME2     NULL,
  must_change_password BIT      NOT NULL CONSTRAINT DF_users_mustchg DEFAULT 0,  -- set when an admin creates or resets the account
  failed_attempts INT           NOT NULL CONSTRAINT DF_users_failed DEFAULT 0,
  locked_until    DATETIME2     NULL,
  created_at  DATETIME2        NOT NULL CONSTRAINT DF_users_created DEFAULT SYSUTCDATETIME(),
  last_login  DATETIME2        NULL
);
CREATE UNIQUE INDEX UX_users_login_id ON dbo.users(login_id) WHERE login_id IS NOT NULL;
CREATE UNIQUE INDEX UX_users_email    ON dbo.users(email)    WHERE email    IS NOT NULL;
GO

CREATE TABLE dbo.tickets (
  id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_tickets_id DEFAULT NEWID() CONSTRAINT PK_tickets PRIMARY KEY,
  ticket_no    BIGINT IDENTITY(1001,1) NOT NULL CONSTRAINT UQ_tickets_no UNIQUE,
  type         NVARCHAR(10)   NOT NULL CONSTRAINT CK_tickets_type CHECK (type IN ('IT','ERP')),
  category     NVARCHAR(100)  NOT NULL,
  priority     NVARCHAR(10)   NOT NULL CONSTRAINT DF_tickets_priority DEFAULT 'Medium'
               CONSTRAINT CK_tickets_priority CHECK (priority IN ('Low','Medium','High','Critical')),
  status       NVARCHAR(20)   NOT NULL CONSTRAINT DF_tickets_status DEFAULT 'Open'
               CONSTRAINT CK_tickets_status CHECK (status IN ('Open','In Progress','On Hold','Resolved','Closed')),
  title        NVARCHAR(150)  NOT NULL,
  description  NVARCHAR(MAX)  NOT NULL,
  unit         NVARCHAR(100)  NULL,
  department   NVARCHAR(100)  NULL,
  erp_module   NVARCHAR(100)  NULL,
  erp_screen   NVARCHAR(150)  NULL,
  created_by   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_tickets_created_by REFERENCES dbo.users(id),
  assigned_to  UNIQUEIDENTIFIER NULL CONSTRAINT FK_tickets_assigned_to REFERENCES dbo.users(id),
  created_at   DATETIME2      NOT NULL CONSTRAINT DF_tickets_created DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2      NOT NULL CONSTRAINT DF_tickets_updated DEFAULT SYSUTCDATETIME(),
  resolved_at  DATETIME2      NULL,
  target_date  DATE           NULL,     -- promised date, set by the IT team / admin; drives on-time delivery %
  target_time  TIME(0)        NULL      -- optional promised time on that date
);
CREATE INDEX IX_tickets_created_by  ON dbo.tickets(created_by);
CREATE INDEX IX_tickets_assigned_to ON dbo.tickets(assigned_to);
CREATE INDEX IX_tickets_status      ON dbo.tickets(status);
GO

CREATE TABLE dbo.ticket_comments (
  id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_comments_id DEFAULT NEWID() CONSTRAINT PK_comments PRIMARY KEY,
  ticket_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_comments_ticket REFERENCES dbo.tickets(id),
  author_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_comments_author REFERENCES dbo.users(id),
  body       NVARCHAR(MAX)    NOT NULL,
  internal   BIT              NOT NULL CONSTRAINT DF_comments_internal DEFAULT 0,  -- staff-only note (IT team + admins)
  created_at DATETIME2        NOT NULL CONSTRAINT DF_comments_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_comments_ticket ON dbo.ticket_comments(ticket_id);
GO

CREATE TABLE dbo.ticket_attachments (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_att_id DEFAULT NEWID() CONSTRAINT PK_att PRIMARY KEY,
  ticket_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_att_ticket REFERENCES dbo.tickets(id),
  comment_id  UNIQUEIDENTIFIER NULL CONSTRAINT FK_att_comment REFERENCES dbo.ticket_comments(id),
  stored_name NVARCHAR(100)    NOT NULL,   -- file name on disk, inside UPLOAD_DIR\<ticket id>\
  file_name   NVARCHAR(200)    NOT NULL,   -- original name, for display only
  mime        NVARCHAR(50)     NOT NULL,
  size_bytes  INT              NOT NULL,
  uploaded_by UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_att_user REFERENCES dbo.users(id),
  created_at  DATETIME2        NOT NULL CONSTRAINT DF_att_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_att_ticket ON dbo.ticket_attachments(ticket_id);
GO

CREATE TABLE dbo.ticket_events (
  id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_events_id DEFAULT NEWID() CONSTRAINT PK_events PRIMARY KEY,
  ticket_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_events_ticket REFERENCES dbo.tickets(id),
  actor_id   UNIQUEIDENTIFIER NULL CONSTRAINT FK_events_actor REFERENCES dbo.users(id),
  action     NVARCHAR(30)     NOT NULL,   -- created / assigned / status / priority / comment
  detail     NVARCHAR(300)    NULL,
  created_at DATETIME2        NOT NULL CONSTRAINT DF_events_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_events_ticket ON dbo.ticket_events(ticket_id);
GO

-- Issues: internal tracking items for the IT team and admins (an ERP bug, a server problem, a project).
-- One issue can be linked to several tickets. Regular users never see issues.
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
GO

CREATE TABLE dbo.issue_comments (
  id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_icomments_id DEFAULT NEWID() CONSTRAINT PK_icomments PRIMARY KEY,
  issue_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_icomments_issue REFERENCES dbo.issues(id),
  author_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_icomments_author REFERENCES dbo.users(id),
  body       NVARCHAR(MAX)    NOT NULL,
  created_at DATETIME2        NOT NULL CONSTRAINT DF_icomments_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_icomments_issue ON dbo.issue_comments(issue_id);
GO

CREATE TABLE dbo.issue_tickets (
  issue_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_itickets_issue REFERENCES dbo.issues(id),
  ticket_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_itickets_ticket REFERENCES dbo.tickets(id),
  linked_by  UNIQUEIDENTIFIER NULL CONSTRAINT FK_itickets_user REFERENCES dbo.users(id),
  created_at DATETIME2        NOT NULL CONSTRAINT DF_itickets_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_issue_tickets PRIMARY KEY (issue_id, ticket_id)
);
CREATE INDEX IX_itickets_ticket ON dbo.issue_tickets(ticket_id);
GO

CREATE TABLE dbo.issue_events (
  id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ievents_id DEFAULT NEWID() CONSTRAINT PK_ievents PRIMARY KEY,
  issue_id   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ievents_issue REFERENCES dbo.issues(id),
  actor_id   UNIQUEIDENTIFIER NULL CONSTRAINT FK_ievents_actor REFERENCES dbo.users(id),
  action     NVARCHAR(30)     NOT NULL,
  detail     NVARCHAR(300)    NULL,
  created_at DATETIME2        NOT NULL CONSTRAINT DF_ievents_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_ievents_issue ON dbo.issue_events(issue_id);
GO

-- App settings (e.g. who new IT / ERP tickets are assigned to automatically)
CREATE TABLE dbo.settings (
  k          NVARCHAR(50)  NOT NULL CONSTRAINT PK_settings PRIMARY KEY,
  v          NVARCHAR(200) NULL,
  updated_at DATETIME2     NOT NULL CONSTRAINT DF_settings_updated DEFAULT SYSUTCDATETIME()
);
GO

-- Every confirmed target date / time; the current one has superseded_at NULL, earlier ones are shown struck through.
CREATE TABLE dbo.ticket_targets (
  id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ttargets_id DEFAULT NEWID() CONSTRAINT PK_ttargets PRIMARY KEY,
  ticket_id     UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ttargets_ticket REFERENCES dbo.tickets(id),
  target_date   DATE             NOT NULL,
  target_time   TIME(0)          NULL,
  set_by        UNIQUEIDENTIFIER NULL CONSTRAINT FK_ttargets_setby REFERENCES dbo.users(id),
  set_at        DATETIME2        NULL CONSTRAINT DF_ttargets_setat DEFAULT SYSUTCDATETIME(),
  superseded_at DATETIME2        NULL,
  superseded_by UNIQUEIDENTIFIER NULL CONSTRAINT FK_ttargets_supby REFERENCES dbo.users(id)
);
CREATE INDEX IX_ttargets_ticket ON dbo.ticket_targets(ticket_id);
GO
