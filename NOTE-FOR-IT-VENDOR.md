# Request for IT vendor — internal helpdesk website

Hello,

We are putting a small internal helpdesk website (JM TicketDesk) on the office Windows Server. It is only used inside the company network. We need two things from you.

**1. A DNS name**

Please create this record in the DNS for jmaluminium.com:

- Name: `helpdesk`   (so the address becomes `helpdesk.jmaluminium.com`)
- Type: `A`
- Value: `<the server's internal IP address — to be filled in>`

This points to a private address, so it only works from inside the office network. Nothing is exposed to the internet.

**2. An HTTPS certificate for that name** — either option is fine:

- **Option A (free, preferred):** a Let's Encrypt certificate using DNS validation (for example with the free "win-acme" tool on the server). For this to **renew automatically**, we need one of:
  - a one-time CNAME record `_acme-challenge.helpdesk` pointing to a validation service (acme-dns), **or**
  - an API key / script that lets the tool add a TXT record to our DNS, **or**
  - you add the verification TXT record by hand every time the certificate renews (this is the weakest option — if it is missed, the site shows a security warning).
- **Option B:** you supply a paid certificate for `helpdesk.jmaluminium.com` and install it in IIS, and renew it yearly.

Please tell us which option you prefer, and the date you can do it. Nothing else on the server (including the HRMS) will be changed.

Thank you.
