# JM TicketDesk — Office Server Setup (Windows Server + SQL Server)

This version runs entirely on your own server: **SQL Server** for data, a **folder** for screenshots, **Microsoft sign-in** for login, and **Outlook (Microsoft Graph)** for email. IIS sits in front and provides HTTPS.

It is built to live **beside** the HRMS without touching it: its own database, its own SQL login, its own IIS site, its own port (3100, reachable only from the server itself).

Plan for ~2–3 hours the first time, outside working hours.

---

## 0. Before you start

- Take a **snapshot/backup** of the server (or at least the SQL databases and IIS config).
- Tell your IT vendor what they need to do: see `NOTE-FOR-IT-VENDOR.md` (DNS name + HTTPS certificate). Start this first — it is the slowest part.
- You need: Windows admin on the server, SQL `sysadmin`, and a Microsoft Entra admin (for step 3).

## 1. Install the prerequisites (once)

1. **Node.js LTS (22 or newer)** — nodejs.org, "Windows Installer (.msi)", default options (it adds itself to the system PATH). Check: open a *new* PowerShell → `node -v`.
2. **Git for Windows** — git-scm.com, default options. Check: new PowerShell → `git --version`.
3. **IIS URL Rewrite** and **Application Request Routing (ARR) 3.0** — download both installers from iis.net.
   After installing: IIS Manager → click the **server name** (top of the tree) → *Application Request Routing Cache* → *Server Proxy Settings* → tick **Enable proxy** → Apply.
   (This does not change how the HRMS site works; it only allows sites that have a rewrite rule pointing at another address to proxy.)

## 2. Database

1. Open `deploy\sql-setup.sql` in SSMS, **change the password**, run it. It creates the `TicketDesk` database and a login that can only use that database.
2. In SSMS select the `TicketDesk` database, open `deploy\schema.sql`, run it.
3. Make sure SQL Server accepts this login: SQL Server Configuration Manager → TCP/IP *Enabled*; and Server Properties → Security → **SQL Server and Windows Authentication mode** (restart the SQL service if you change it — ask first, since it briefly interrupts the HRMS. If the HRMS already logs in with a SQL username, this is already on).

## 3. Microsoft Entra app (sign-in **and** email, one registration)

At entra.microsoft.com → *App registrations* → **New registration**:

- Name `TicketDesk`, *Accounts in this organizational directory only*.
- Redirect URI: platform **Web**, value `https://helpdesk.jmaluminium.com/api/auth/callback/azure-ad` (use the real hostname).
- Copy **Application (client) ID** and **Directory (tenant) ID**.
- *Certificates & secrets* → New client secret → copy the **Value** now (shown once). Note the expiry date — set a calendar reminder to renew it, or sign-in and email both stop.
- *API permissions* → Add → Microsoft Graph →
  - **Delegated**: `openid`, `profile`, `email`, `User.Read` (usually already there)
  - **Application**: `Mail.Send`
  - then **Grant admin consent**.
- Strongly recommended: ask your Microsoft 365 admin to limit `Mail.Send` to the helpdesk mailbox only (Exchange Online "RBAC for Applications" / application access policy). Otherwise this app *could* send mail as anyone in the company.
- Sending mailbox: e.g. `helpdesk@jmaluminium.com` (a shared mailbox is fine, no licence needed).

## 4. HTTPS name and certificate

See `NOTE-FOR-IT-VENDOR.md`. Result you need: `https://helpdesk.jmaluminium.com` opens on office PCs and shows a valid padlock. (The "Capture screen" button only works over HTTPS.)

## 5. Install the app

1. Put the app on the server, e.g. `D:\apps\ticketdesk`. The easiest way is `git clone` (see **Updating later (Git)** below); copying this folder also works.
2. Create the screenshot folder, e.g. `D:\TicketDeskFiles`.
3. In the app folder: copy `.env.example` → `.env.local` and fill it in (every line is explained in the file). Put your own email in `INITIAL_ADMIN_EMAILS`.
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

Open `https://helpdesk.jmaluminium.com` → *Sign in with Microsoft*. You become admin automatically (from `INITIAL_ADMIN_EMAILS`). Then open **Users** and set each person's role after they have signed in once:
  - **IT team** for Danish and Prashant. They get their own login (same Microsoft sign-in). They see only tickets assigned to them plus the unassigned pool (they can assign those to themselves), and their KPIs. They cannot see other people's tickets or the Users page.
  - **Admin** for anyone who should see and assign everything.
  - Type a **phone number** against each IT-team member. When a ticket is assigned, the person who raised it sees that name and number on the ticket.

**Test checklist**
- Raise an IT ticket with a pasted screenshot and one from *Capture screen*.
- Raise an ERP ticket. As admin: assign, change status, add an internal note, reply. Check the Outlook emails arrive (look in Junk the first time).
- Sign in as an ordinary user: confirm they only see their own tickets and no internal notes.

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
| Microsoft says "redirect URI mismatch" (AADSTS50011) | The Redirect URI in Entra differs from `NEXTAUTH_URL` + `/api/auth/callback/azure-ad` |
| "This account can't use TicketDesk" | Email not in `ALLOWED_DOMAINS`, or the user was disabled under *Users* |
| A real colleague is denied although they use the right account | Their Microsoft 365 mailbox address is not on `jmaluminium.com`/`.in` (check *Users* in the Microsoft 365 admin center) |
| Sign-in loops back to login | `NEXTAUTH_URL` / `NEXTAUTH_SECRET` missing or wrong; site opened by a different hostname than `NEXTAUTH_URL` |
| Tickets don't load / "Server error" | Wrong SQL settings in `.env.local`, SQL login not allowed, TCP/IP off — see `logs\app.log` |
| No emails | `MS_SENDER` mailbox wrong, `Mail.Send` not consented, or client secret expired — see `logs\app.log` ("Email error") |
| Can't upload screenshots | `UPLOAD_DIR` folder missing, or SYSTEM account lacks write access to it |
| "Capture screen" button missing | Page is not on HTTPS |
