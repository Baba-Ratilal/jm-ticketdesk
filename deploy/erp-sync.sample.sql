-- Copy this file to  deploy\erp-sync.sql  and change it to match the ERP's user table.
-- It runs on the ERP's ORACLE database, with a READ-ONLY account, every night at 12 AM.
--
-- It must return these columns (names are not case sensitive; EMAIL, UNIT, DEPARTMENT may be NULL):
--   LOGIN_ID    the user ID people type at the ERP login
--   FULL_NAME   the person's name
--   EMAIL       work email, if the ERP has one
--   UNIT        plant / unit, if known
--   DEPARTMENT  department, if known
--   ACTIVE      1/0 or Y/N — whether the ERP account is enabled
--   SECRET      the password column, exactly as the ERP stores it (see ERP_SECRET_MODE in .env.local)
--
-- No semicolon at the end. Example (table and column names here are made up):
SELECT u.USER_ID    AS LOGIN_ID,
       u.USER_NAME  AS FULL_NAME,
       u.EMAIL_ID   AS EMAIL,
       u.UNIT_NAME  AS UNIT,
       u.DEPT_NAME  AS DEPARTMENT,
       CASE WHEN u.STATUS = 'A' THEN 1 ELSE 0 END AS ACTIVE,
       u.PASSWORD   AS SECRET
  FROM ERP_USERS u
