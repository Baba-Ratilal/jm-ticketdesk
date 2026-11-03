-- ============================================================
-- JM TicketDesk (office server) — tables
-- Run this in SSMS while connected to the TicketDesk database
-- (after running sql-setup.sql). Safe to run once on an empty database.
-- ============================================================

CREATE TABLE dbo.users (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_users_id DEFAULT NEWID() CONSTRAINT PK_users PRIMARY KEY,
  email       NVARCHAR(256)    NOT NULL CONSTRAINT UQ_users_email UNIQUE,   -- always lower case
  full_name   NVARCHAR(200)    NULL,
  role        NVARCHAR(10)     NOT NULL CONSTRAINT DF_users_role DEFAULT 'user'
              CONSTRAINT CK_users_role CHECK (role IN ('user','agent','admin')),   -- agent = IT team member
  phone       NVARCHAR(20)     NULL,   -- shown to the requester when a ticket is assigned
  unit        NVARCHAR(100)    NULL,
  department  NVARCHAR(100)    NULL,
  active      BIT              NOT NULL CONSTRAINT DF_users_active DEFAULT 1,
  created_at  DATETIME2        NOT NULL CONSTRAINT DF_users_created DEFAULT SYSUTCDATETIME(),
  last_login  DATETIME2        NULL
);
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
  resolved_at  DATETIME2      NULL
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
