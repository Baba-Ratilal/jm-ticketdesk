-- ============================================================
-- Add the ERP users to TicketDesk. Run in SSMS (it switches to TicketDesk itself). Safe to re-run:
-- anyone whose user ID already exists is left untouched (roles, phone and passwords are never changed).
--
-- These accounts are marked as ERP accounts with NO password yet. They can sign in once the nightly ERP sync
-- (scripts\erp-sync.js) has run, which fills in each person's ERP password. Until then they cannot sign in.
-- Everyone is added as a normal user; promote the IT team on the Users page.
--
-- Not added (shared / system / company accounts):
--   ADMIN3  ADMINISTRATOR
--   AU001  AUDITOR
--   CA001  CANTEEN
--   BH001  GATE1
--   DI002  GATE2
--   AK003  GATE3
--   GA006  GATE4
--   MA004  GATE5
--   GA007  GATE6
--   MKTG  MARKETING
--   DD1324  Par Filters Pvt. Ltd.
--   DD1186  Shriram Enterprises
--   U-CLIENT  U-CLIENT
-- ============================================================
USE TicketDesk;
GO
DECLARE @new TABLE (login_id NVARCHAR(100) NOT NULL, full_name NVARCHAR(200) NOT NULL);
INSERT INTO @new (login_id, full_name) VALUES
    (N'ab005', N'Abhijeet Devidas Dahifale'),
    (N'ri001', N'Abhishek Bornare'),
    (N'ab001', N'Abhishek Ghodke'),
    (N'ad001', N'Aditya Adhav'),
    (N'aj001', N'Ajay Shelwani'),
    (N'aj002', N'Ajit Dosi'),
    (N'crmaj001', N'Ajit Patil'),
    (N'ak004', N'Akash Bhausaheb Gavhane'),
    (N'ak001', N'Akshay Deokar'),
    (N'ak010', N'Akshay Haribhau Hume'),
    (N'na001', N'Amod Kumar'),
    (N'am004', N'Amol Gav'),
    (N'ag002', N'Amol Gavhane'),
    (N'am001', N'Amol Gavhane'),
    (N'am003', N'Amruta Yogesh Kulkarni'),
    (N'an001', N'Anand Dayma'),
    (N'an004', N'Anand R'),
    (N'an003', N'Aniket Bhausaheb Jadhav'),
    (N'an005', N'Aniket Dhamane'),
    (N'ar001', N'Aniket Kandekar'),
    (N'ar010', N'Arbaz Shaikh'),
    (N'as001', N'Ashok Sakharam Shelar'),
    (N'at001', N'Atul Gite'),
    (N'sa008', N'Bhagvat Ghadge'),
    (N'de001', N'Deepak Shinde'),
    (N'an002', N'Devidas Jagtap'),
    (N'de002', N'Dipak K'),
    (N'di005', N'Dipali Bandu Kshirsagar'),
    (N'me001', N'Dnyaneshwar Kalhapure'),
    (N'ga003', N'Ganesh Belge'),
    (N'ga001', N'Ganesh Chavan'),
    (N'ga005', N'Ganesh Dhokchaule'),
    (N'ga004', N'Ganesh Lipane'),
    (N'ra005', N'Gaurav Kale'),
    (N'ma002', N'Geeta Shete'),
    (N'sa004', N'Hariom Goel'),
    (N'hi001', N'Himanshu Pandya'),
    (N'ja001', N'Jalindar Kalhapure'),
    (N'ji001', N'Jitendra Sawant'),
    (N'ji002', N'Jitendra Yadav'),
    (N'crmka001', N'Kailas Karbhari Garje'),
    (N'ka001', N'Kaushal Yadav'),
    (N'ak002', N'Kiran Sase'),
    (N'ki001', N'Kishor Ukande'),
    (N'ki002', N'Kishor Vairagal'),
    (N'kr002', N'Krushna Matere'),
    (N'kr001', N'Krushna Pawar'),
    (N'crmma001', N'Manisha Ganesh Balme'),
    (N'ka002', N'Manoj Kalhapure'),
    (N'ma007', N'Manoj Popat Kalhapure'),
    (N'ma001', N'Mayur Aware'),
    (N'na002', N'Najim Shaikh'),
    (N'boss', N'Nikhilendra Lodha'),
    (N'ni003', N'Nilesh Bhange'),
    (N'ni001', N'Nilesh Gunjal'),
    (N'ni002', N'Nilesh Kate'),
    (N'crmni003', N'Nilesh Vilas Gunjal'),
    (N'ni004', N'Nitin Adsure'),
    (N'ra003', N'Payal Takavale'),
    (N'pr001', N'Pravin Shirsath'),
    (N'ra002', N'Radheshyam Kapildav Yadav'),
    (N'ra004', N'Rahul Thube'),
    (N'ra008', N'Rajendra Laxman Jadhav'),
    (N'ra001', N'Ramdas Bade'),
    (N'rk002', N'Rani kulat'),
    (N'ro001', N'Rohit Jadhav'),
    (N'crmrk001', N'Rushikesh Dattatray Karanjkar'),
    (N'ru001', N'Rushikesh Mehetre'),
    (N'sa024', N'Sachin Kumar Jha'),
    (N'ki003', N'Sachin Nimase'),
    (N'sa001', N'Sagar Bhagat'),
    (N'sa002', N'Sagar Ubale'),
    (N'sa005', N'Sagar Wackchoure'),
    (N'pa001', N'Sambhaji Haral'),
    (N'sa026', N'Sampat Kale'),
    (N'sa025', N'Sandeep More'),
    (N'sa009', N'Sandeep Shinde'),
    (N'sa016', N'Sandesh Balkrishna Pawar'),
    (N'ga002', N'Sandip Amkar'),
    (N'sa007', N'Sandip Sinare'),
    (N'sa003', N'Sapana Patil'),
    (N'crmsa008', N'Satish Tarade'),
    (N'sh001', N'Shivaji Jadhav'),
    (N'sh002', N'Shubham Dhumal'),
    (N'crmsk001', N'Sonali Kerulkar'),
    (N'sk001', N'Sonali Kulkarni'),
    (N'su002', N'Sudarshan Lodha'),
    (N'su003', N'Sudarshan Nikhilendra Lodha'),
    (N'su001', N'Sujit Dhawale'),
    (N'sw001', N'Swapnil Kadam'),
    (N'tu001', N'Tulishiram Shahane'),
    (N'tu002', N'Tushar Gaikwad'),
    (N'up001', N'Upendra Gupta'),
    (N'v0001', N'V Soundararajan'),
    (N'vi008', N'Vinod Nanu Rajbhar'),
    (N'ar002', N'Vipin Pandey'),
    (N'vi009', N'Vipul Kharade'),
    (N'sa006', N'Vishal Lande'),
    (N'vi004', N'Vishwas Shivaji Shivcharan'),
    (N'vi001', N'Vivek Kumar Patel'),
    (N'vi002', N'Vivek Tiwari'),
    (N'ma003', N'Yogesh Mandlik'),
    (N'yo001', N'Yogita Prashant Sonawane');

INSERT INTO dbo.users (login_id, full_name, role, active, source, must_change_password)
SELECT n.login_id, n.full_name, 'user', 1, 'erp', 0
  FROM @new n
 WHERE NOT EXISTS (SELECT 1 FROM dbo.users u WHERE u.login_id = n.login_id);

SELECT 'OK' AS result, @@ROWCOUNT AS users_added,
       (SELECT COUNT(*) FROM dbo.users WHERE source = 'erp') AS erp_users_total;
GO
