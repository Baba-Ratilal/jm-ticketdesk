# JM TicketDesk — Office Server Setup (Windows Server + SQL Server)

This version runs entirely on your own server: **SQL Server** for data (signing in with **Windows authentication**, so no SQL password exists), a **folder** for screenshots, **ERP user ID + password** for login (the user list is copied from the ERP's Oracle database every night at 12 AM), and optionally **Outlook (Microsoft Graph)** for email alerts.

It is built to live **beside** the HRMS without touching it: its own database, its own access rights (only that database), and its own port (3100). IIS in front is optional and provides HTTPS.

Plan for ~2–3 hours the first time, outside working hours.

---

## 0. Before you start

- Take a **snapshot/backup** of the server (or at least the SQL databases and IIS config).
- Tell your IT vendor what they need to do: see `NOTE-FOR-IT-VENDOR.md` (DNS name + HTTPS certificate). Start this first — it is the slowest part.
- You need: Windows admin on the server, SQL `sysadmin`, and — only if you want email alerts — a Microsoft Entra admin (step 3). For the ERP login (step 8) you also need an Oracle DBA to create a read-only account.

## 1. Install the prerequisites (once)

1. **Node.js 22 or 24 LTS** — nodejs.org, choose the **LTS** download (not "Current"), "Windows Installer (.msi)", default options (it adds itself to the system PATH). Check: open a *new* PowerShell → `node -v`.
   **Microsoft ODBC Driver 18 for SQL Server** — search for it on microsoft.com, download the x64 installer, default options. It is only a connection driver: it does not change SQL Server or the HRMS.
2. **Git for Windows** — git-scm.com, default options. Check: new PowerShell → `git --version`.
3. **IIS URL Rewrite** and **Application Request Routing (ARR) 3.0** — download both installers from iis.net.
   After installing: IIS Manager → click the **server name** (top of the tree) → *Application Request Routing Cache* → *Server Proxy Settings* → tick **Enable proxy** → Apply.
   (This does not change how the HRMS site works; it only allows sites that have a rewrite rule pointing at another address to proxy.)

## 2. Database

The app signs in to SQL Server as the Windows account it runs under (**SYSTEM**, see `deploy\install-task.ps1`) over a direct local channel (shared memory). There is **no SQL password** and no need to change SQL Server's authentication mode. No restart is needed.

1. Open `deploy\sql-setup.sql` in SSMS (connected as a sysadmin) and run it. It creates the `TicketDesk` database and gives SYSTEM access to **that database only**.
2. In SSMS select the `TicketDesk` database, open `deploy\schema.sql`, run it.
3. **Already created the database with an older version?** Run `deploy\upgrade-userid-windows.sql` once instead (it adds the new columns and the SYSTEM access; safe to re-run), and afterwards remove the old SQL login: `DROP USER ticketdesk_app; DROP LOGIN ticketdesk_app;`
4. Check the connection, in an elevated PowerShell in the app folder: `.\deploy\test-db.ps1`. Both lines ("As you" and "As SYSTEM") should start with **OK**. If not, see *If something goes wrong*.

## 3. Email alerts (optional) — Microsoft Entra app

People no longer sign in with Microsoft. The Entra app is used **only to send email** (new ticket, assigned, replies). Skip this section to run without email alerts (leave the `MS_*` lines in `.env.local` empty).

At entra.microsoft.com → *App registrations* → **New registration**:

- Name `TicketDesk`, *Accounts in this organizational directory only*. No redirect URI is needed.
- Copy **Application (client) ID** and **Directory (tenant) ID**.
- *Certificates & secrets* → New client secret → copy the **Value** now (shown once). Note the expiry date — set a calendar reminder to renew it, or email stops.
- *API permissions* → Add → Microsoft Graph → **Application** → `Mail.Send` → **Grant admin consent**.
- Strongly recommended: ask your Microsoft 365 admin to limit `Mail.Send` to the helpdesk mailbox only (Exchange Online "RBAC for Applications" / application access policy). Otherwise this app *could* send mail as anyone in the company.
- Sending mailbox: e.g. `helpdesk@jmaluminium.com` (a shared mailbox is fine, no licence needed).
- Emails go to people whose **email address** is known: the ERP's email column (if it has one). People without one simply get no email.

## 4. The address people use

Because nobody signs in through Microsoft any more, there are two ways to reach the site:

- **Simple (inside the office network only):** `http://<server IP>:3100`. Set `NEXTAUTH_URL` to exactly that. The app must then listen on the network, not only on the server itself: edit `deploy\start.cmd` and change `-H 127.0.0.1` to `-H 0.0.0.0`, and allow TCP 3100 in Windows Firewall for the **private/domain** profile only. **Caution:** passwords then travel unencrypted across the office network. Acceptable for a trial; use HTTPS before everyone starts using it.
- **Recommended: HTTPS name through IIS.** See `NOTE-FOR-IT-VENDOR.md` (an internal DNS name and a certificate, nothing public). Result: `https://helpdesk.<your domain>` opens on office PCs with a valid padlock, and `NEXTAUTH_URL` is that address. (The "Capture screen" button only works over HTTPS.)

## 5. Install the app

1. Put the app on the server, e.g. `D:\apps\ticketdesk`. The easiest way is `git clone` (see **Updating later (Git)** below); copying this folder also works.
2. Create the screenshot folder, e.g. `D:\TicketDeskFiles`.
3. In the app folder: copy `.env.example` → `.env.local` and fill it in (every line is explained in the file). Put your own ERP user ID in `INITIAL_ADMIN_IDS`.
4. In an elevated PowerShell in the app folder:
   ```powershell
   npm ci
   npm run build
   .\deploy\install-task.ps1
   ```
   Check it is alive: `Invoke-WebRequest http://127.0.0.1:3100/login -UseBasicParsing | Select StatusCode` → 200.

## 6. IIS site

1. Create a folder `C:\inetpub\ticketdesk-proxy` and copy `deploy\web.config` into it.
2. IIS Manager → Sites → **Add Website**: name `TicketDesk`, that folder, binding **https**, port 443, host name `helpdesk.jmaluminium.com`, select the certificate. (Add an http binding on port 80 if you want the automatic redirect.)
3. Do **not** edit the HRMS site.

## 7. First sign-in

You need one account that can sign in before the ERP copy has run (step 8). Create it on the server, in an elevated PowerShell in the app folder:

```powershell
node --env-file=.env.local scripts\set-password.js yourid --name "Your Name" --role admin
```

It asks for a password (nothing shows while you type). Then open the site and sign in with that user ID and password. Also put the same ID in `INITIAL_ADMIN_IDS` so it stays admin when it is later replaced by the ERP copy. (After step 8 you can use your ERP user ID and ERP password instead; users that come from the ERP use the ERP password.)

Open **Users** and set each person's role:
  - **IT team** for Danish and Prashant. They sign in with their own ERP user ID. They see only tickets assigned to them plus the unassigned pool (they can assign those to themselves), and their KPIs. They cannot see other people's tickets or the Users page.
  - **Admin** for anyone who should see and assign everything.
  - Type a **phone number** against each IT-team member. When a ticket is assigned, the person who raised it sees that name and number on the ticket.

The same command (`scripts\set-password.js`) also creates or resets accounts for people who are **not** in the ERP.

**Test checklist**
- Raise an IT ticket with a pasted screenshot and one from *Capture screen*.
- Raise an ERP ticket. As admin: assign, change status, add an internal note, reply. Check the Outlook emails arrive (look in Junk the first time).
- Sign in as an ordinary user: confirm they only see their own tickets and no internal notes.

## 8. ERP users and passwords (nightly, 12 AM)

Every night at 12 AM a scheduled task copies the user list from the ERP's Oracle database into TicketDesk, so people sign in with their ERP user ID and ERP password. A password changed in the ERP works in TicketDesk after the next run. An account that is disabled or removed in the ERP is disabled in TicketDesk. The sync **never** changes TicketDesk roles or phone numbers.

1. Ask your Oracle DBA for a **read-only** Oracle account that can `SELECT` from the ERP's user table only, and for the connect string (`host:port/service_name`). Oracle 12.1 or newer is supported without installing any Oracle client.
2. Copy `deploy\erp-sync.sample.sql` to `deploy\erp-sync.sql` and edit the table and column names to match the ERP's user table. (This file stays on the server and is not in Git.)
3. Fill in the `ERP_*` lines in `.env.local`. **How the ERP stores passwords decides `ERP_SECRET_MODE`:**
   - readable (plain text) or reversibly encrypted → `plain`. TicketDesk keeps only its own salted hash, never the readable password.
   - a hash, in hex text, made with md5 / sha1 / sha256 / sha512 → `hash`, and set `ERP_PW_SCHEME`. Other hash types are not supported yet.
4. Try it without changing anything: `npm run erp-sync -- --dry`. It prints how many users would be added, updated or disabled.
5. Run it for real once: `npm run erp-sync`. Then register the nightly task: `.\deploy\install-sync-task.ps1`. Results are written to `logs\erp-sync.log`.

Safety: if the ERP query returns no users, or would disable more than a fifth of the accounts, the sync stops and changes nothing. If a TicketDesk account created with `set-password` has the same user ID as an ERP user, it is left alone and the log says so.

## Backups

Back up **both**: the `TicketDesk` database and the screenshot folder (`UPLOAD_DIR`). Add them to the backup you already run for the HRMS.

## Updating later (Git)

The code lives in a **private GitHub repository**. The server only *pulls* from it. The database, the screenshot folder and `.env.local` are not in Git, so an update never touches your data.

**One-time setup (on your Mac)**
1. On github.com create a **private** repository, for example `jm-ticketdesk` (leave it empty).
2. Unzip the app, then in Terminal inside the folder:
   ```
   git remote add origin https://github.com/<your-account>/jm-ticketdesk.git
   git branch -M main
   git push -u origin main
   ```

**One-time setup (on the server)**
1. Install **Git for Windows** (git-scm.com). (You install it in section 1.)
2. Give the server read-only access to the repository: on GitHub open the repository → *Settings → Deploy keys → Add deploy key*, with a key made on the server by `ssh-keygen -t ed25519` (leave the passphrase empty, paste the `.pub` file). Tick nothing for write access.
3. Instead of copying the folder in step 5, clone it:
   ```powershell
   git clone git@github.com:<your-account>/jm-ticketdesk.git D:\apps\ticketdesk
   ```
   then continue with `.env.local`, `npm ci`, `npm run build` and `install-task.ps1` as in step 5.

**Every update**
1. On your Mac: put the new files in the folder, then `git add -A`, `git commit -m "what changed"`, `git push`.
2. On the server, in an elevated PowerShell in the app folder: `.\deploy\update.ps1`

The script stops the app, pulls, rebuilds and restarts it (about two minutes). If the build fails it puts the previous version back by itself. If the update includes database changes it lists the `deploy\upgrade-*.sql` files to run **once** in SSMS.

**Going back to an older version:** `git log --oneline` shows versions; then `.\deploy\update.ps1 -Version <the short code>`. To return to the latest, run `.\deploy\update.ps1` with no version.

Do not edit files on the server by hand; the script refuses to update if you did.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| Page shows 502 / 404 from IIS | App not running — check `logs\app.log`; ARR proxy not enabled; port in `web.config` ≠ `start.cmd` |
| "Wrong user ID or password" for a good ERP user | The nightly copy has not run yet (run `npm run erp-sync`), the account is disabled in the ERP, or `ERP_SECRET_MODE` / `ERP_PW_SCHEME` does not match how the ERP stores passwords |
| "This account is locked for 15 minutes" | Five wrong passwords in a row. Wait, or an admin runs `scripts\set-password.js` for a local account |
| `test-db.ps1` says FAIL as SYSTEM but OK as you | SYSTEM has no access to the TicketDesk database — run `deploy\sql-setup.sql` (or the upgrade script) again |
| `test-db.ps1`: data source name not found | The ODBC Driver 18 is not installed (or use `-Driver "ODBC Driver 17 for SQL Server"` if that is what you installed) |
| App log: "Windows authentication needs the 'msnodesqlv8' package" | `npm ci` could not install the optional Windows driver: run `npm ci` again, check `npm ls msnodesqlv8`, and send the output if it stays empty |
| Sign-in does nothing / loops back to login | `NEXTAUTH_URL` / `NEXTAUTH_SECRET` missing or wrong; site opened by a different address than `NEXTAUTH_URL` (use exactly the same one) |
| Tickets don't load / "Server error" | Database not reachable as SYSTEM, or wrong settings in `.env.local` — run `.\deploy\test-db.ps1`, then see `logs\app.log` |
| No emails | `MS_*` lines empty (email is off), the person has no email address in the ERP, `Mail.Send` not consented, or client secret expired — see `logs\app.log` ("Email error") |
| Can't upload screenshots | `UPLOAD_DIR` folder missing, or SYSTEM account lacks write access to it |
| "Capture screen" button missing | Page is not on HTTPS |

## Adding users, passwords and Issues

**Adding a user (admin).** Users page → **+ Add user**. Enter the user ID, name and role; leave the password empty to have one generated, or type a default. The temporary password is shown **once** — give it to the person. At their first sign-in they are taken straight to a "choose your own password" page and cannot use anything else until they do. **Reset password** on the same page does the same for someone who forgot theirs (not available for accounts that sign in with their ERP password — those are reset in the ERP). Everyone can change their own password later with the key icon in the sidebar.

**Issues (IT team and admins only).** An issue is an internal tracking item — an ERP bug, a server problem, a project — with its own owner, priority and status, notes and timeline. One issue can have several tickets linked to it (by ticket number, or "Create issue from this ticket" on any ticket). Regular users never see issues.

**Boards.** Both **Issues** and the ticket queue (**All tickets / Support queue**) have a **Board / List** switch. On the board, drag a card to another column to change its status (on a phone use the "Move to…" menu on the card). IT-team members can only move tickets that are unassigned or assigned to them.

**Updating the server.** This version adds database tables: run `deploy\upgrade-issues-passwords.sql` once in SSMS **before** starting the new version (safe to re-run; no restart needed).

## My work and the daily to-do email

**My work** (menu, IT team and admins) lists everything assigned to you — tickets and issues together, most urgent first, with how long each has been waiting. Admins also see a small table of what each team member has on their plate.

**Daily email at 9 AM, 2 PM and 4 PM.** Each IT-team member and admin gets their own list plus the number of unassigned tickets; admins also get the team table. People with nothing assigned and an empty queue are skipped (admins always get it).

Set-up, once:
1. **Emails.** Users page → type each team member's email in the *Email* column (Rushab, Ram, Vaibhav, Danish, Prashant). Make sure each is set to *IT team* or *Admin*.
2. **Sending.** Fill `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` and `MS_SENDER` in `.env.local` (same values as the ticket alert emails; section 3). `MS_SENDER` can be a shared mailbox such as `helpdesk@…` — the emails then come from the helpdesk, not from a person. The Entra app needs the *Mail.Send* application permission, ideally limited to that one mailbox.
3. **Test:** `npm run send-digest -- --dry` shows who would get what and sends nothing. `npm run send-digest -- --to=you@company.com` sends every digest to your own address.
4. **Schedule:** in an elevated PowerShell, `.\deploy\install-digest-task.ps1` (task "TicketDesk digest"). Try it with `Start-ScheduledTask -TaskName 'TicketDesk digest'`; the log is `logs\digest.log`.

## Target date, dashboard and on-time delivery %

**Target date.** The IT team or an admin sets it on a ticket (Manage panel → *Target date*): the date we promise the requester. The requester sees it on their ticket list and on the ticket. Tickets past their target date are shown in red in the queue, board, *My work* and the daily email, and listed first.

**Overview** (first item under the menu for the IT team and admins, above the ticket queue): *Pending* (with overdue, due today, no target date, unassigned, IT vs ERP), *Solved* in the chosen period (this month / last 30 days / quarter / year / all time, with the average days to solve), and **On-time delivery %**. It also shows a per-person table and a 6-month trend.

**On-time delivery %** = tickets solved on or before their target date ÷ tickets solved that had a target date, in the chosen period. Dates are judged in India time. Tickets solved without a target date are not counted (the dashboard says how many), so set a target date on every ticket you take.

**Updating the server.** Run `deploy\upgrade-target-date.sql` once in SSMS **before** starting the new version (safe to re-run; no restart).

## Automatic assignment

Users page → **New tickets are assigned automatically to**: pick a person for IT tickets and one for ERP tickets (only IT-team members and admins are listed; choose "Nobody" to leave tickets in the queue). New tickets then go straight to that person, who is notified; the requester sees who is handling it. Admins can still reassign any ticket from the ticket page or the queue; IT-team members cannot take over a ticket assigned to someone else.

Run `deploy\upgrade-auto-assign.sql` once in SSMS first (safe to re-run). If it has not been run, tickets are still saved normally — they are just not auto-assigned.

**Target time (optional).** Next to the target date there is an optional time. With a time, a ticket counts as on time only if it is solved by that time on the target day, and it turns overdue (red) once that time passes; without a time it is on time until the end of the target day. Run `deploy\upgrade-target-time.sql` once in SSMS (after `upgrade-target-date.sql`) before starting this version.

**Confirming and keeping the history of target dates.** Choosing a target date/time does nothing until you press **Set target… / Change target…** and confirm the question that appears (it shows the old and new value). Every confirmed change is kept: the earlier targets appear under *Earlier targets* on the ticket, struck through, with who changed them and when, and the timeline records "changed from … to …". Removing a target also needs confirmation. Run `deploy\upgrade-target-history.sql` once in SSMS (after the target date and target time scripts) before starting this version; if it has not been run, tickets still open and save normally, they just do not keep the history.

## MOM tab (minutes of meeting)

1. In SSMS run `deploy\upgrade-mom.sql` once (before updating the app).
2. Update the app as usual. A **MOM** item appears in the menu for the IT team and admins.
3. Columns: Sr no, MOM date, Point, Target date, Status (Open / In Progress / On Hold / Done), Assigned to, Remark.
4. Admin can add, edit and delete points. The IT team can view all points and change only the status and remark (press Save on the row).
5. A target date in the past on a point that is not Done shows in red as overdue.

## Date on tickets and issues

1. In SSMS run `deploy\upgrade-raised-date.sql` once, **before** updating the app (the app reads the new column).
2. The New ticket and New issue forms now have a **Date** field (today by default; past dates allowed, future dates not). It is shown in the lists and on the ticket / issue page. Existing rows keep the date they were created.
