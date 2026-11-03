-- ============================================================
-- JM TicketDesk — one-time database setup
-- Run in SSMS as a sysadmin. This creates a SEPARATE database and a login
-- that can only touch that database — it does not touch the HRMS database.
-- 1) Change the password below.  2) Run this file.  3) Then run schema.sql
--    with the TicketDesk database selected.
-- ============================================================

CREATE DATABASE TicketDesk;
GO

CREATE LOGIN ticketdesk_app WITH PASSWORD = N'CHANGE_ME_to_a_long_random_password', CHECK_POLICY = ON;
GO

USE TicketDesk;
GO

CREATE USER ticketdesk_app FOR LOGIN ticketdesk_app;
ALTER ROLE db_datareader ADD MEMBER ticketdesk_app;
ALTER ROLE db_datawriter ADD MEMBER ticketdesk_app;
GO

-- Needed on the server (once): SQL Server Configuration Manager ->
--   * TCP/IP enabled for the instance
--   * Server authentication = "SQL Server and Windows Authentication mode" (restart the SQL service)
