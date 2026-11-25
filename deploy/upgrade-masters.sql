-- ============================================================
-- Upgrade: Masters (admin-managed lists: units, departments, designations, ticket categories, ERP modules)
-- and a designation on each user. Run ONCE in SSMS BEFORE the new version. Safe to re-run.
-- The lists start with the values that were built into the app; edit them in the app afterwards (Masters).
-- ============================================================
USE TicketDesk;
GO
IF COL_LENGTH('dbo.users','designation') IS NULL
  ALTER TABLE dbo.users ADD designation NVARCHAR(100) NULL;
GO
IF OBJECT_ID('dbo.masters') IS NULL
BEGIN
  CREATE TABLE dbo.masters (
    id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_masters_id DEFAULT NEWID() CONSTRAINT PK_masters PRIMARY KEY,
    kind       NVARCHAR(20)  NOT NULL CONSTRAINT CK_masters_kind CHECK (kind IN ('unit','department','designation','it_category','erp_category','erp_module')),
    value      NVARCHAR(100) NOT NULL,
    sort_order INT           NOT NULL CONSTRAINT DF_masters_sort DEFAULT 0,
    active     BIT           NOT NULL CONSTRAINT DF_masters_active DEFAULT 1,
    created_at DATETIME2     NOT NULL CONSTRAINT DF_masters_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_masters UNIQUE (kind, value)
  );
END
GO
DECLARE @seed TABLE (kind NVARCHAR(20), value NVARCHAR(100), sort_order INT);
INSERT INTO @seed (kind, value, sort_order) VALUES
    (N'unit', N'Unit 1', 10),
    (N'unit', N'Unit 2', 20),
    (N'unit', N'Unit 3', 30),
    (N'unit', N'Unit 4', 40),
    (N'unit', N'Head Office', 50),
    (N'department', N'Foundry', 10),
    (N'department', N'PPC', 20),
    (N'department', N'Production', 30),
    (N'department', N'Packing – Dispatch', 40),
    (N'department', N'Accounts – Finance', 50),
    (N'department', N'HR – Admin', 60),
    (N'department', N'Quality', 70),
    (N'department', N'Stores', 80),
    (N'department', N'Maintenance', 90),
    (N'department', N'Sales', 100),
    (N'department', N'Purchase', 110),
    (N'department', N'Audit / MIS', 120),
    (N'department', N'Other', 130),
    (N'designation', N'Director', 10),
    (N'designation', N'General Manager', 20),
    (N'designation', N'Manager', 30),
    (N'designation', N'Dy. Manager', 40),
    (N'designation', N'Asst. Manager', 50),
    (N'designation', N'Executive', 60),
    (N'designation', N'Engineer', 70),
    (N'designation', N'Supervisor', 80),
    (N'designation', N'Operator', 90),
    (N'designation', N'Technician', 100),
    (N'designation', N'Helper', 110),
    (N'designation', N'Clerk', 120),
    (N'designation', N'Other', 130),
    (N'it_category', N'Hardware', 10),
    (N'it_category', N'Network / Internet', 20),
    (N'it_category', N'Software', 30),
    (N'it_category', N'Email / Outlook', 40),
    (N'it_category', N'Access / Password', 50),
    (N'it_category', N'Printer / Scanner', 60),
    (N'it_category', N'Other', 70),
    (N'erp_category', N'Bug / Error', 10),
    (N'erp_category', N'Report / MIS request', 20),
    (N'erp_category', N'Access request', 30),
    (N'erp_category', N'Data correction', 40),
    (N'erp_category', N'Training / How-to', 50),
    (N'erp_category', N'New requirement', 60),
    (N'erp_category', N'Other', 70),
    (N'erp_module', N'Sales', 10),
    (N'erp_module', N'Purchase', 20),
    (N'erp_module', N'Stores / Inventory', 30),
    (N'erp_module', N'PPC', 40),
    (N'erp_module', N'Production', 50),
    (N'erp_module', N'Foundry', 60),
    (N'erp_module', N'Packing – Dispatch', 70),
    (N'erp_module', N'Accounts – Finance', 80),
    (N'erp_module', N'HR / Payroll', 90),
    (N'erp_module', N'Reports / MIS', 100),
    (N'erp_module', N'Other', 110);
INSERT INTO dbo.masters (kind, value, sort_order)
SELECT s.kind, s.value, s.sort_order FROM @seed s
 WHERE NOT EXISTS (SELECT 1 FROM dbo.masters m WHERE m.kind = s.kind AND m.value = s.value);
GO
SELECT 'OK' AS result, (SELECT COUNT(*) FROM dbo.masters) AS master_rows, COL_LENGTH('dbo.users','designation') AS designation_col;
