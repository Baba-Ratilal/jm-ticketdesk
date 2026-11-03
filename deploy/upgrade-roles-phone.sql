-- Only needed if you ALREADY ran an older schema.sql (before IT-team logins and phone numbers).
-- A fresh install does not need this file.
ALTER TABLE dbo.users ADD phone NVARCHAR(20) NULL;
GO
ALTER TABLE dbo.users DROP CONSTRAINT CK_users_role;
ALTER TABLE dbo.users ADD CONSTRAINT CK_users_role CHECK (role IN ('user','agent','admin'));
GO
