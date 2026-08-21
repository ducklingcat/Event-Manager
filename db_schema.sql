
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

-- Seed Events
INSERT INTO events (event_id, organiser_id, title, description, event_date, full_price_tickets, full_price_cost, concession_tickets, concession_cost, state, created_at, published_at) 
VALUES 
(1, 1, 'Morning Yoga Retreat', 'Start your day with a relaxing outdoor yoga session.', '2026-09-10', 20, 15.00, 10, 10.00, 'published', '2026-08-20T10:00:00.000Z', '2026-08-21T10:00:00.000Z'),
(2, 1, 'Advanced Yoga Flow', 'Push your limits in this high intensity 90-minute class.', '2026-09-15', 15, 20.00, 5, 12.00, 'published', '2026-08-20T11:00:00.000Z', '2026-08-21T11:00:00.000Z'),
(3, 1, 'Beginner Basics', 'Perfect for those just starting their yoga journey.', '2026-09-20', 30, 10.00, 15, 5.00, 'published', '2026-08-21T09:00:00.000Z', '2026-08-21T09:30:00.000Z'),
(4, 1, 'Sunset Meditation', 'A peaceful evening meditation session.', NULL, 0, 0, 0, 0, 'draft', '2026-08-21T12:00:00.000Z', NULL);

-- Seed Bookings for Event 1
INSERT INTO bookings (event_id, attendee_name, full_price_count, concession_count, booked_at) 
VALUES 
(1, 'Alice Tan', 1, 0, '2026-08-21T10:15:00.000Z'),
(1, 'Bob Benson', 2, 0, '2026-08-21T11:30:00.000Z'),
(1, 'Charlie Brown', 0, 1, '2026-08-21T12:05:00.000Z'),
(1, 'Diana', 1, 1, '2026-08-21T13:45:00.000Z'),
(1, 'Evan Dwight', 2, 0, '2026-08-21T14:20:00.000Z'),
(1, 'Fiona Lim', 0, 2, '2026-08-21T15:10:00.000Z');

-- Seed Bookings for Event 2
INSERT INTO bookings (event_id, attendee_name, full_price_count, concession_count, booked_at) 
VALUES 
(2, 'George Lim', 1, 0, '2026-08-21T10:30:00.000Z'),
(2, 'Hannah', 1, 1, '2026-08-21T11:45:00.000Z'),
(2, 'Ian Lee', 2, 0, '2026-08-21T14:15:00.000Z'),
(2, 'Jane Wong', 1, 0, '2026-08-21T16:00:00.000Z'),
(2, 'Kevin Magnussen', 0, 1, '2026-08-21T17:25:00.000Z');
--end
COMMIT;
