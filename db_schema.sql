
-- This makes sure that foreign_key constraints are observed and that errors will be thrown for violations
PRAGMA foreign_keys=ON;

BEGIN TRANSACTION;

-- Create your tables with SQL commands here (watch out for slight syntactical differences with SQLite vs MySQL)
--start
-- One row per organiser account. Each organiser registers their own login
-- only manages their own events and site settings. password_hash is a bcrypt hash not plaintext password.
CREATE TABLE IF NOT EXISTS organiser_accounts (
    organiser_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- One row per organiser, matching one to one with organiser_accounts holding the site name and description. 
--Editable on the Site Settings Page and shown to attendees
-- they can see who is hosting an event.
CREATE TABLE IF NOT EXISTS site_settings (
    organiser_id INTEGER PRIMARY KEY REFERENCES organiser_accounts(organiser_id),
    site_name TEXT NOT NULL,
    site_description TEXT NOT NULL
);

-- Events created and published by organisers. organiser_id ties each event to its owner so
-- the organiser routes can enforce ownership. The ticket columns hold total capacity, not remaining stock. 
-- Availability is computed at read time as capacity minus the tickets already booked,
-- so no separate remaining column has to be kept in sync.
CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    organiser_id INTEGER NOT NULL REFERENCES organiser_accounts(organiser_id),
    title TEXT NOT NULL DEFAULT 'New event',
    description TEXT NOT NULL DEFAULT '',
    event_date TEXT,                          -- ISO date string YYYY-MM-DD
    full_price_tickets INTEGER NOT NULL DEFAULT 0,
    full_price_cost REAL NOT NULL DEFAULT 0,
    concession_tickets INTEGER NOT NULL DEFAULT 0,
    concession_cost REAL NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'draft',      -- 'draft' or 'published'
    created_at TEXT NOT NULL,
    modified_at TEXT,
    published_at TEXT
);

-- One row per attendee booking against an event, holding how many of each ticket type was bought.
-- ON DELETE CASCADE removes the bookings of a deleted event at the database level
-- so the delete route does not have to clear them manually.
CREATE TABLE IF NOT EXISTS bookings (
    booking_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    attendee_name TEXT NOT NULL,
    full_price_count INTEGER NOT NULL DEFAULT 0,
    concession_count INTEGER NOT NULL DEFAULT 0,
    booked_at TEXT NOT NULL,                  -- purchase date/time
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
);

-- Insert starter organiser login: username "organiser", password "password123!". The password is
-- stored as a bcrypt hash.
INSERT INTO organiser_accounts (organiser_id, username, password_hash, created_at)
VALUES (1, 'organiser', '$2b$10$4g5QZp1pc6C8aB87tdqbfey.W65j6MgNwmUlqTOE64dbgvd.Pvi6W', datetime('now'));

-- Site settings for the seeded organiser.
INSERT INTO site_settings (organiser_id, site_name, site_description)
VALUES (1, 'Stretch Yoga', 'Yoga classes for all ages and abilities');
--end
COMMIT;
