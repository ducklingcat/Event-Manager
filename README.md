## Event Manager — CM2040 Mid-Term Coursework

### Installation requirements

* NodeJS — https://nodejs.org/en/
* SQLite3 — follow instructions at https://www.tutorialspoint.com/sqlite/sqlite_installation.htm 

### Running the app

* `npm install` - installs all node packages
* `npm run build-db` (Mac/Linux) or `npm run build-db-win` (Windows) - creates database
* `npm run start` - start serving the web app (Access via http://localhost:3000)

### Organiser accounts

The app is multi tenant. Any number of organisers can register their own account at
http://localhost:3000/organiser/register, and each only ever sees/manages their own events and site settings. A default account has been created by `db_schema.sql`:

* Username: `organiser`
* Password: `password123!`

Log in at http://localhost:3000/organiser/login. 
All organiser routes (home, site settings, create/edit/publish/delete events) require login as the organiser.
The attendee pages show events/organiser info from every organiser combined.

### Additional npm packages

* **bcrypt** — hashes the organiser's password before it's stored, and verifies login
  attempts against the hash. Never store or compare plaintext passwords.
* **express-session** — issues a signed session cookie so the server can tell whether
  the current browser is logged in as the organiser without storing state client-side.
* **express-validator** — server-side validation of submitted form fields such as
  required text, non-negative integers/numbers, custom date rules, instead of string checks 

### Project structure

* `index.js` — app entry point, Express/EJS/SQLite/session setup, mounts routers
* `routes/organiser.js` — organiser register/login/logout/home/settings/edit-event routes
* `routes/attendee.js` — attendee home + event/booking routes
* `views/.ejs` — server rendered templates
* `public/main.css` — style
* `db_schema.sql` — defines database tables
