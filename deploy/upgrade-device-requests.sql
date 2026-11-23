-- ============================================================
-- Upgrade: Mobile & IT Device Requirement form (IT/MOB/01) with its approvals and IT issuing.
-- Run ONCE in SSMS (it switches to TicketDesk itself). Safe to re-run. Needs no restart.
-- ============================================================
USE TicketDesk;
GO

IF OBJECT_ID('dbo.device_requests') IS NULL
BEGIN
  CREATE TABLE dbo.device_requests (
    id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_dreq_id DEFAULT NEWID() CONSTRAINT PK_dreq PRIMARY KEY,
    req_no         BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT UQ_dreq_no UNIQUE,
    requirement_date DATE           NOT NULL,
    requested_by   UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_dreq_user REFERENCES dbo.users(id),
    status         NVARCHAR(30)    NOT NULL CONSTRAINT DF_dreq_status DEFAULT 'Pending Dept Head'
                   CONSTRAINT CK_dreq_status CHECK (status IN ('Pending Dept Head','Pending HR','Pending Management','Approved','Issued','Rejected','Cancelled')),
    created_at     DATETIME2       NOT NULL CONSTRAINT DF_dreq_created DEFAULT SYSUTCDATETIME(),
    updated_at     DATETIME2       NOT NULL CONSTRAINT DF_dreq_updated DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_dreq_status ON dbo.device_requests(status);
  CREATE INDEX IX_dreq_user   ON dbo.device_requests(requested_by);
END
GO

IF OBJECT_ID('dbo.device_request_items') IS NULL
BEGIN
  CREATE TABLE dbo.device_request_items (
    id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_dritem_id DEFAULT NEWID() CONSTRAINT PK_dritem PRIMARY KEY,
    request_id    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_dritem_req REFERENCES dbo.device_requests(id),
    sr_no         INT             NOT NULL,
    employee_name NVARCHAR(150)   NOT NULL,
    unit          NVARCHAR(100)   NULL,
    department    NVARCHAR(100)   NULL,
    designation   NVARCHAR(100)   NULL,
    mobile_type   NVARCHAR(20)    NOT NULL CONSTRAINT DF_dritem_mob DEFAULT 'N/A' CONSTRAINT CK_dritem_mob CHECK (mobile_type IN ('Android','Non-Android','N/A')),
    sim_required  NVARCHAR(5)     NOT NULL CONSTRAINT DF_dritem_sim DEFAULT 'N/A' CONSTRAINT CK_dritem_sim CHECK (sim_required IN ('Yes','No','N/A')),
    laptop_pc     NVARCHAR(300)   NULL,
    accessories   NVARCHAR(300)   NULL,
    purpose       NVARCHAR(500)   NOT NULL,
    asset_tag     NVARCHAR(200)   NULL,          -- IT use only: Asset Tag / Serial No.
    issued_on     DATE            NULL,          -- IT use only
    issued_by     UNIQUEIDENTIFIER NULL CONSTRAINT FK_dritem_issuer REFERENCES dbo.users(id)  -- IT sign
  );
  CREATE INDEX IX_dritem_req ON dbo.device_request_items(request_id);
END
GO

IF OBJECT_ID('dbo.device_request_approvals') IS NULL
BEGIN
  CREATE TABLE dbo.device_request_approvals (
    request_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_drapp_req REFERENCES dbo.device_requests(id),
    stage       TINYINT         NOT NULL CONSTRAINT CK_drapp_stage CHECK (stage IN (1,2,3)),  -- 1 Dept Head, 2 HR, 3 Management
    approver_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_drapp_approver REFERENCES dbo.users(id),
    decision    NVARCHAR(10)    NULL CONSTRAINT CK_drapp_dec CHECK (decision IN ('Approved','Rejected')),
    decided_by  UNIQUEIDENTIFIER NULL CONSTRAINT FK_drapp_decider REFERENCES dbo.users(id),
    decided_at  DATETIME2       NULL,
    remark      NVARCHAR(500)   NULL,
    CONSTRAINT PK_drapp PRIMARY KEY (request_id, stage)
  );
  CREATE INDEX IX_drapp_approver ON dbo.device_request_approvals(approver_id);
END
GO

IF OBJECT_ID('dbo.device_request_events') IS NULL
BEGIN
  CREATE TABLE dbo.device_request_events (
    id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_drev_id DEFAULT NEWID() CONSTRAINT PK_drev PRIMARY KEY,
    request_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_drev_req REFERENCES dbo.device_requests(id),
    actor_id   UNIQUEIDENTIFIER NULL CONSTRAINT FK_drev_actor REFERENCES dbo.users(id),
    action     NVARCHAR(30)    NOT NULL,
    detail     NVARCHAR(500)   NULL,
    created_at DATETIME2       NOT NULL CONSTRAINT DF_drev_created DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_drev_req ON dbo.device_request_events(request_id);
END
GO

IF OBJECT_ID('dbo.device_request_files') IS NULL
BEGIN
  CREATE TABLE dbo.device_request_files (
    id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_drfile_id DEFAULT NEWID() CONSTRAINT PK_drfile PRIMARY KEY,
    request_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_drfile_req REFERENCES dbo.device_requests(id),
    stage       TINYINT         NULL,            -- the approval stage this image is proof for
    stored_name NVARCHAR(100)   NOT NULL,
    file_name   NVARCHAR(200)   NOT NULL,
    mime        NVARCHAR(50)    NOT NULL,
    size_bytes  INT             NOT NULL,
    uploaded_by UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_drfile_user REFERENCES dbo.users(id),
    created_at  DATETIME2       NOT NULL CONSTRAINT DF_drfile_created DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_drfile_req ON dbo.device_request_files(request_id);
END
GO

SELECT 'OK' AS result, (SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'device_request%') AS device_tables_should_be_5;
