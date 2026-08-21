//start

/*
Purpose of organiser.js: covers register, login, logout, Organiser Home Page, Site Settings
Page, Edit Event Page, publish and delete actions and the Sales Report.

The app is multi-tenant. Every route below the authentication middleware is scoped to req.session.organiserId, so an organiser only ever sees and changes their own
events and site settings.
*/

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { check, validationResult } = require('express-validator');
const renderError = require('../lib/renderError');

const minPasswordLength = 8;

/*
Purpose: work out the earliest date an event can be set to which is the later of today and the date the event was created or published. 
The edit form uses this for the min on its date input.
Inputs: an event row with created_at and a null published_at
Outputs: a YYYY-MM-DD date string
*/
function minEventDateFor(event) {
    const referenceDate = (event.published_at || event.created_at).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return referenceDate > today ? referenceDate : today;
}

/*
Purpose: add full_price_remaining and concession_remaining to each event row, from the booked totals already joined in from bookings
Inputs: an array of event rows, each with the ticket capacities and the booked totals
Outputs: Nil
*/
function addRemainingCounts(events) {
    events.forEach((event) => {
        event.full_price_remaining = event.full_price_tickets - event.full_booked;
        event.concession_remaining = event.concession_tickets - event.concession_booked;
    });
}

/*
Route: Organiser Register Page
Purpose: show the registration form
Inputs: nil
Outputs: renders organiser-register.ejs with no errors
*/
router.get('/register', (req, res) => {
    res.render('organiser-register', { errors: [], username: '' });
});

/*
Route: Handle Organiser Registration
Purpose: validate the submitted fields with express-validator, then create a new organiser account with a bcrypt-hashed password and a default site settings row
Inputs: req.body.username and req.body.password checked by the validation chains below. 
The password rule is split over two chains so an empty password reports only the required message since mapped() keeps the first error per field
Outputs: inserts the organiser_accounts and site_settings rows and redirects to the login page on success. 
If validation fails, it renders the form with per field messages with the submitted username kept but not the password
*/
router.post('/register', [
    check('username', 'Username is required.').trim().not().isEmpty(),
    check('password', 'Password is required.').not().isEmpty(),
    check('password', `Password must be at least ${minPasswordLength} characters long.`).isLength({ min: minPasswordLength })
], (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return res.render('organiser-register', {
            errors: Object.values(validationErrors.mapped()).map((error) => error.msg),
            username: username
        });
    }

    /*
    DB interaction: check whether the requested username is already taken
    Purpose: give a friendly error instead of relying only on the unique constraint
    Inputs: username
    Outputs: the matching organiser_accounts row or undefined when the username is free
  */
    global.db.get('SELECT * FROM organiser_accounts WHERE username = ?', [username], (lookupErr, existing) => {
        if (lookupErr) {
            return renderError(res, 500, 'Failed to check username availability.');
        }
        if (existing) {
            return res.render('organiser-register', { errors: ['That username is already taken.'], username: username });
        }

        bcrypt.hash(password, 10, (hashErr, passwordHash) => {
            if (hashErr) {
                return renderError(res, 500, 'Password hashing failed.');
            }

            const now = new Date().toISOString();

            /*
            DB interaction: insert the new organiser account
            Purpose: create the login the organiser will use from now on
            Inputs: username, password_hash, created_at
            Outputs: the new organiser_id inserted and as this.lastID
            */
            global.db.run(
                'INSERT INTO organiser_accounts (username, password_hash, created_at) VALUES (?, ?, ?)',
                [username, passwordHash, now],
                function (insertErr) {
                    if (insertErr) {
                        return renderError(res, 500, 'Failed to create organiser account.');
                    }

                    const organiserId = this.lastID;

                    /*
                    DB interaction: create a default site_settings row for the new organiser
                    Purpose: every organiser has exactly one site_settings row, so their pages have something to load
                    Inputs: organiser_id, and placeholder site_name and site_description
                    Outputs: a new site_settings row keyed on organiser_id
                    */
                    global.db.run(
                        'INSERT INTO site_settings (organiser_id, site_name, site_description) VALUES (?, ?, ?)',
                        [organiserId, username, 'Tell attendees about your events here.'],
                        (settingsErr) => {
                            if (settingsErr) {
                                return renderError(res, 500, 'Failed to create starter site settings.');
                            }
                            res.redirect('/organiser/login');
                        }
                    );
                }
            );
        });
    });
});

/*
Route: Organiser Login Page
Purpose: show the login form
Inputs: nil
Outputs: renders organiser-login.ejs with no error message
*/
router.get('/login', (req, res) => {
    res.render('organiser-login', { error: null });
});

/*
Route: Handle Organiser Login
Purpose: check the submitted username and password against organiser_accounts and, on success, mark the session as logged in as that organiser
Inputs: req.body.username and req.body.password
Outputs: on success it sets the session fields for the logged-in organiser and redirects to the Organiser Home Page. On failure it re-renders the login form with an error message
*/
router.post('/login', (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    /*
    DB interaction: look up the organiser account by username
    Purpose: fetch the stored password hash to check the submitted password against
    Inputs: username
    Outputs: the matching organiser_accounts row, or undefined when there is no such username
    */
    global.db.get('SELECT * FROM organiser_accounts WHERE username = ?', [username], (err, account) => {
        if (err) {
            return renderError(res, 500, 'Failed to check organiser account.');
        }
        if (!account) {
            return res.render('organiser-login', { error: 'Invalid username or password.' });
        }

        bcrypt.compare(password, account.password_hash, (compareErr, matches) => {
            if (compareErr) {
                return renderError(res, 500, 'Failed to verify password.');
            }
            if (!matches) {
                return res.render('organiser-login', { error: 'Invalid username or password.' });
            }

            req.session.organiserLoggedIn = true;
            req.session.organiserId = account.organiser_id;
            req.session.organiserUsername = account.username;
            res.redirect('/organiser');
        });
    });
});

/*
Route: Organiser Logout
Purpose: end the organiser's session
Inputs: none
Outputs: destroys the session and redirects to the main ome page
*/
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

/* Authentication middleware: every route registered on this router below this point requires an
   active organiser session. Register, login and logout above stay reachable without one.*/
function checkAuth(req, res, next) {
    if (req.session && req.session.organiserLoggedIn) {
        return next();
    }
    res.redirect('/organiser/login');
}
router.use(checkAuth);

/*
Route: Organiser Home Page
Purpose: show the site name and description of the logged in organiser, a create new event button 
and their own published and draft event lists with management actions
Inputs: req.session.organiserId, and optional success or error banner messages from the query string
Outputs: renders organiser-home.ejs with the site settings and events of this organiser
*/
router.get('/', (req, res) => {
    const organiserId = req.session.organiserId;

    /*
    DB interaction: fetch the site_settings row for this organiser
    Purpose: display the organiser's own name and description on their home page
    Inputs: organiser_id
    Outputs: the site_settings row with organiser_id, site_name and site_description
    */
    global.db.get('SELECT * FROM site_settings WHERE organiser_id = ?', [organiserId], (settingsErr, siteSettings) => {
        if (settingsErr) {
            return renderError(res, 500, 'Failed to load site settings.');
        }

        /*
        DB interaction: fetch the published events owned by this organiser, soonest first, with their booked ticket totals
        Purpose: populate the published events list, showing tickets remaining alongside the original capacity
        Inputs: organiser_id
        Outputs: event rows where state is published and organiser_id matches, each with full_booked and concession_booked 
        summed from bookings. Left join keeps events with no bookings in the results, and coalesce reports their totals 
        as 0 rather than NULL
        */
        global.db.all(
            `SELECT events.*,
                    COALESCE(SUM(bookings.full_price_count), 0) AS full_booked,
                    COALESCE(SUM(bookings.concession_count), 0) AS concession_booked
             FROM events
             LEFT JOIN bookings ON bookings.event_id = events.event_id
             WHERE events.state = 'published' AND events.organiser_id = ?
             GROUP BY events.event_id
             ORDER BY events.event_date ASC`,
            [organiserId],
            (publishedErr, publishedEvents) => {
                if (publishedErr) {
                    return renderError(res, 500, 'Failed to load published events.');
                }
                addRemainingCounts(publishedEvents);

                /*
                DB interaction: fetch the draft events owned by this organiser newest first with their booked ticket totals
                Purpose: populate the draft events list with the same remaining and capacity view as the published events. Drafts can carry bookings too
                Inputs: organiser_id
                Outputs: event rows where state is draft and organiser_id matches, each with full_booked and concession_booked summed from bookings
                */
                global.db.all(
                    `SELECT events.*,
                            COALESCE(SUM(bookings.full_price_count), 0) AS full_booked,
                            COALESCE(SUM(bookings.concession_count), 0) AS concession_booked
                     FROM events
                     LEFT JOIN bookings ON bookings.event_id = events.event_id
                     WHERE events.state = 'draft' AND events.organiser_id = ?
                     GROUP BY events.event_id
                     ORDER BY events.created_at DESC`,
                    [organiserId],
                    (draftErr, draftEvents) => {
                        if (draftErr) {
                            return renderError(res, 500, 'Failed to load draft events.');
                        }
                        addRemainingCounts(draftEvents);

                        res.render('organiser-home', {
                            siteSettings: siteSettings,
                            publishedEvents: publishedEvents,
                            draftEvents: draftEvents,
                            success: req.query.success || null,
                            error: req.query.error || null
                        });
                    }
                );
            }
        );
    });
});

/*
Route: Create New Event
Purpose: create a new draft event with placeholder values owned by the logged-in organiser
then send them straight to its edit page to fill in the details
Inputs: req.session.organiserId
Outputs: redirects to the edit page of the new event with a success message
*/
router.post('/events', (req, res) => {
    const organiserId = req.session.organiserId;
    const now = new Date().toISOString();

    /*
    DB interaction: insert a new draft event owned by this organiser
    Purpose: give the organiser a new event row to edit
    Inputs: organiser_id and a created_at timestamp
    Outputs: the new event_id, available as this.lastID in the callback
    */
    global.db.run(
        `INSERT INTO events (organiser_id, title, description, event_date, full_price_tickets, full_price_cost,
            concession_tickets, concession_cost, state, created_at)
         VALUES (?, 'New event', '', NULL, 0, 0, 0, 0, 'draft', ?)`,
        [organiserId, now],
        function (err) {
            if (err) {
                return renderError(res, 500, 'Failed to create event.');
            }
            res.redirect(`/organiser/events/${this.lastID}/edit?success=${encodeURIComponent('Event created. Fill in the details below.')}`);
        }
    );
});

/*
Route: Publish Event
Purpose: move the organiser's selected event from draft to published and record the publication time.
The event must have a date and at least one ticket type with capacity before it can be published
Inputs: URL param :id for the event and req.session.organiserId for the logged-in organiser
Outputs: redirects to the Organiser Home Page with a success message on publish
redirects back with an error banner when the date or capacity is missing
renders the 404 page when the event is missing or not owned and the 500 page on a database error
*/
router.post('/events/:id/publish', (req, res) => {
    const eventId = req.params.id;
    const organiserId = req.session.organiserId;

    /*
    DB interaction: fetch the event first and scope to this organiser
    Purpose: confirm ownership and existence. Read the date and capacity before the update
    Inputs: event_id, organiser_id
    Outputs: the matching event row or undefined
    */
    global.db.get('SELECT * FROM events WHERE event_id = ? AND organiser_id = ?', [eventId, organiserId], (findErr, event) => {
        if (findErr) {
            return renderError(res, 500, 'Failed to load event.');
        }
        if (!event) {
            return renderError(res, 404, 'Event not found or not owned by this organiser.');
        }
        if (!event.event_date) {
            return res.redirect(`/organiser?error=${encodeURIComponent('Cannot publish an event without a date. Set an event date first.')}`);
        }
        if (event.full_price_tickets === 0 && event.concession_tickets === 0) {
            return res.redirect(`/organiser?error=${encodeURIComponent('Cannot publish an event with no tickets available. Set a capacity for at least one ticket type.')}`);
        }

        const now = new Date().toISOString();

        /*
        DB interaction: set the event state to published and record the time to this organiser
        Purpose: publish a draft event so attendees can see and book it. one organiser cannot publish another organiser event
        Inputs: event_id, organiser_id, published_at timestamp
        Outputs: updates the matching event row
        */
        global.db.run(
            "UPDATE events SET state = 'published', published_at = ? WHERE event_id = ? AND organiser_id = ?",
            [now, eventId, organiserId],
            (updateErr) => {
                if (updateErr) {
                    return renderError(res, 500, 'Failed to publish event.');
                }
                res.redirect(`/organiser?success=${encodeURIComponent('Event published.')}`);
            }
        );
    });
});

/*
Route: decide whether to delete immediately or ask for confirmation
Purpose: delete an event owned by the logged in organiser immediately when it has no bookings
else show a confirmation page stating how many bookings and tickets would be lost rather than silently discarding attendee data. 
bookings.event_id is ON DELETE CASCADE, so an actual delete removes its bookings at the database level
Inputs: URL param :id for the event and req.session.organiserId
Outputs: redirects to the Organiser Home Page when the event is deleted
renders the confirmation page when the event has bookings or renders an error page
*/
router.post('/events/:id/delete', (req, res) => {
    const eventId = req.params.id;
    const organiserId = req.session.organiserId;

    /*
    DB interaction: confirm the event exists and belongs to this organiser
    Purpose: prevent one organiser from deleting an event owned by another through a guessed URL
    Inputs: event_id, organiser_id
    Outputs: the matching event row or undefined when not found or not owned
    */
    global.db.get('SELECT * FROM events WHERE event_id = ? AND organiser_id = ?', [eventId, organiserId], (findErr, event) => {
        if (findErr) {
            return renderError(res, 500, 'Failed to look up event.');
        }
        if (!event) {
            return renderError(res, 404, 'Event not found or not owned by this organiser.');
        }

        /*
        DB interaction: count the bookings and tickets placed against this event
        Purpose: decide whether the delete needs a confirmation
        if yes, tell the organiser exactly how many would be lost. 
        Drafts and published events are also checked rather than assumed to be empty instead of assuming 0 bookings
        Inputs: event_id
        Outputs: booking_count and ticket_count
        */
        global.db.get(
            `SELECT COUNT(*) AS booking_count,
                    COALESCE(SUM(full_price_count + concession_count), 0) AS ticket_count
             FROM bookings WHERE event_id = ?`,
            [eventId],
            (summaryErr, summary) => {
                if (summaryErr) {
                    return renderError(res, 500, 'Failed to check event bookings.');
                }

                if (summary.booking_count > 0) {
                    return res.render('organiser-delete-confirm', { event: event, summary: summary });
                }

                /*
                DB interaction: delete the event, since it has no bookings to lose and needs no confirmation
                Purpose: remove the event from the draft and published lists
                Inputs: event_id, organiser_id
                Outputs: removes the matching event row
                */
                global.db.run('DELETE FROM events WHERE event_id = ? AND organiser_id = ?', [eventId, organiserId], (eventErr) => {
                    if (eventErr) {
                        return renderError(res, 500, 'Failed to delete event.');
                    }
                    res.redirect(`/organiser?success=${encodeURIComponent('Event deleted.')}`);
                });
            }
        );
    });
});

/*
Route: Confirm Delete Event
Purpose: delete an event after the organiser has seen and accepted the booking-loss warning on the confirmation page
Inputs: URL param :id for the event, and req.session.organiserId
Outputs: redirects to the Organiser Home Page with a success message once the event and its bookings are removed by the cascade, or renders an error page when the event is not owned or not found
*/
router.post('/events/:id/delete/confirm', (req, res) => {
    const eventId = req.params.id;
    const organiserId = req.session.organiserId;

    /*
    DB interaction: delete the event scope to this organiser
    Purpose: re-check ownership at the point of deletion rather than trusting how the confirmation page was reached. Bookings are removed by the cascade
    Inputs: event_id, organiser_id
    Outputs: removes the matching event row, or affects no rows when the event is not owned or not found
    */
    global.db.run('DELETE FROM events WHERE event_id = ? AND organiser_id = ?', [eventId, organiserId], function (err) {
        if (err) {
            return renderError(res, 500, 'Failed to delete event.');
        }
        if (this.changes === 0) {
            return renderError(res, 404, 'Event not found or not owned by this organiser.');
        }
        res.redirect(`/organiser?success=${encodeURIComponent('Event deleted.')}`);
    });
});

/*
Route: Site Settings Page
Purpose: show a form pre filled with the site name and description of the logged in organiser
Inputs: req.session.organiserId
Outputs: renders site-settings.ejs with the site_settings row of this organiser
*/
router.get('/settings', (req, res) => {
    const organiserId = req.session.organiserId;

    /*
    DB interaction: fetch the site_settings row for this organiser
    Purpose: pre fill the settings form
    Inputs: organiser_id
    Outputs: the site_settings row with organiser_id, site_name and site_description
    */
    global.db.get('SELECT * FROM site_settings WHERE organiser_id = ?', [organiserId], (err, siteSettings) => {
        if (err) {
            return renderError(res, 500, 'Failed to load site settings.');
        }
        res.render('site-settings', { siteSettings: siteSettings, errors: [] });
    });
});

/*
Route: Update Site Settings
Purpose: validate the new site name and description with express-validator and save them for the logged-in organiser
Inputs: req.session.organiserId, plus req.body.site_name and req.body.site_description checked by the validation chains
Outputs: updates the site_settings row and redirects to the Organiser Home Page with a success message. 
On a validation failure it re renders the form with errors
*/
router.post('/settings', [
    check('site_name', 'Site name is required.').trim().not().isEmpty(),
    check('site_description', 'Site description is required.').trim().not().isEmpty()
], (req, res) => {
    const organiserId = req.session.organiserId;
    const siteName = (req.body.site_name || '').trim();
    const siteDescription = (req.body.site_description || '').trim();

    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return res.render('site-settings', {
            siteSettings: { site_name: siteName, site_description: siteDescription },
            errors: Object.values(validationErrors.mapped()).map((error) => error.msg)
        });
    }

    /*
    DB interaction: update the site_settings row for this organiser with the new values
    Purpose: save the chosen site name and description
    Inputs: site_name, site_description, organiser_id
    Outputs: updates the site_settings row where organiser_id matches
    */
    global.db.run(
        'UPDATE site_settings SET site_name = ?, site_description = ? WHERE organiser_id = ?',
        [siteName, siteDescription, organiserId],
        (err) => {
            if (err) {
                return renderError(res, 500, 'Failed to update site settings.');
            }
            res.redirect(`/organiser?success=${encodeURIComponent('Site settings saved.')}`);
        }
    );
});

/*
Route: Organiser Edit Event Page
Purpose: show a form pre filled with one event owned by the logged in organiser
Inputs: URL param :id for the event, req.session.organiserId, and an success message from req.query after creating the event
Outputs: renders organiser-edit-event.ejs with the current event data or the error page when the event is not found or not owned
*/
router.get('/events/:id/edit', (req, res) => {
    const eventId = req.params.id;
    const organiserId = req.session.organiserId;

    /*
    DB interaction: fetch a single event by id, scoped to this organiser
    Purpose: pre fill the edit form and stop an organiser opening an event owned by another through a guessed URL
    Inputs: event_id, organiser_id
    Outputs: the matching event row or undefined when not found or not owned
    */
    global.db.get('SELECT * FROM events WHERE event_id = ? AND organiser_id = ?', [eventId, organiserId], (err, event) => {
        if (err) {
            return renderError(res, 500, 'Failed to load event.');
        }
        if (!event) {
            return renderError(res, 404, 'Event not found or not owned by this organiser.');
        }
        res.render('organiser-edit-event', {
            event: event,
            errors: [],
            minEventDate: minEventDateFor(event),
            success: req.query.success || null
        });
    });
});

/*
Route: Save Event Changes
Purpose: validate each submitted field with express-validator and save the edits to one event owned by the logged in organiser,
then update its modified timestamp. The route runs in three stages: an ownership checking fetch middleware, the validation chains and the saving handler
Inputs: URL param :id for the event, req.session.organiserId 
and the event fields from req.body: title, description, event_date, full_price_tickets, full_price_cost, concession_tickets, concession_cost
Outputs: updates the event and redirects to the Organiser Home Page on success. 
On a validation failure it re renders the form with per field messages. Renders the error page when the event is not owned or not found
*/
router.post('/events/:id',
    /*
    DB interaction: fetch the event first, scoped to this organiser
    Purpose: confirm ownership before validating and saving, store the row on the request so the event_date validators 
    below can read the real created_at and published_at and the handler can carry them forward when the form has to be re rendered with errors
    Inputs: event_id, organiser_id
    Outputs: the matching event row stored as req.existingEvent or a rendered error page when not found or not owned
    */
    (req, res, next) => {
        global.db.get('SELECT * FROM events WHERE event_id = ? AND organiser_id = ?', [req.params.id, req.session.organiserId], (findErr, existingEvent) => {
            if (findErr) {
                return renderError(res, 500, 'Failed to load event.');
            }
            if (!existingEvent) {
                return renderError(res, 404, 'Event not found or not owned by this organiser.');
            }
            req.existingEvent = existingEvent;
            next();
        });
    },
    [
        check('title', 'Event title is required.').trim().not().isEmpty(),
        check('description', 'Event description is required.').trim().not().isEmpty(),
        check('full_price_tickets', 'Number of full-price tickets must be a whole number that is 0 or greater.').trim().isInt({ min: 0 }),
        check('concession_tickets', 'Number of concession tickets must be a whole number that is 0 or greater.').trim().isInt({ min: 0 }),
        check('full_price_cost', 'Full-price ticket cost must be a non-negative number.').trim().isFloat({ min: 0 }),
        check('concession_cost', 'Concession ticket cost must be a non-negative number.').trim().isFloat({ min: 0 }),
        /* 
        An empty date is allowed while the event is a draft, so both date chains skip a
        blank value. The first chain compares against the creation date while the event
        is still a draft or publication date once published. Either way the event
        cannot be updated to before that date. 
        */
        check('event_date').trim().optional({ checkFalsy: true }).custom((value, { req }) => {
            const referenceDate = (req.existingEvent.published_at || req.existingEvent.created_at).slice(0, 10);
            const referenceLabel = req.existingEvent.published_at ? 'publication' : 'creation';
            if (value < referenceDate) {
                throw new Error(`Event date cannot be before the event's ${referenceLabel} date.`);
            }
            return true;
        }),
        check('event_date').trim().optional({ checkFalsy: true }).custom((value) => {
            const today = new Date().toISOString().slice(0, 10);
            if (value < today) {
                throw new Error('Event date cannot be in the past.');
            }
            return true;
        })
    ],
    (req, res) => {
        const eventId = req.params.id;
        const organiserId = req.session.organiserId;
        const existingEvent = req.existingEvent;

        const title = (req.body.title || '').trim();
        const description = (req.body.description || '').trim();
        const eventDateRaw = (req.body.event_date || '').trim();
        const fullPriceTicketsRaw = req.body.full_price_tickets;
        const fullPriceCostRaw = req.body.full_price_cost;
        const concessionTicketsRaw = req.body.concession_tickets;
        const concessionCostRaw = req.body.concession_cost;

        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.render('organiser-edit-event', {
                event: {
                    event_id: eventId,
                    title: title,
                    description: description,
                    event_date: eventDateRaw || null,
                    full_price_tickets: fullPriceTicketsRaw,
                    full_price_cost: fullPriceCostRaw,
                    concession_tickets: concessionTicketsRaw,
                    concession_cost: concessionCostRaw,
                    created_at: existingEvent.created_at
                },
                errors: Object.values(validationErrors.mapped()).map((error) => error.msg),
                minEventDate: minEventDateFor(existingEvent),
                success: null
            });
        }

        const now = new Date().toISOString();

        /*
        DB interaction: update the editable fields of an event and its modified_at timestamp
        Purpose: save the organiser's changes to the event
        Inputs: event_id, organiser_id, title, description, event_date, full_price_tickets, full_price_cost, concession_tickets, concession_cost, modified_at
        Outputs: updates the matching event row
        */
        global.db.run(
            `UPDATE events
             SET title = ?, description = ?, event_date = ?, full_price_tickets = ?, full_price_cost = ?,
                 concession_tickets = ?, concession_cost = ?, modified_at = ?
             WHERE event_id = ? AND organiser_id = ?`,
            [title, description, eventDateRaw || null, parseInt(fullPriceTicketsRaw, 10), parseFloat(fullPriceCostRaw),
                parseInt(concessionTicketsRaw, 10), parseFloat(concessionCostRaw), now, eventId, organiserId],
            (updateErr) => {
                if (updateErr) {
                    return renderError(res, 500, 'Failed to update event.');
                }
                res.redirect('/organiser');
            }
        );
    }
);

/*
Route: Organiser Ticket Sales Report
Purpose: show every booking placed against one event owned by the logged in organiser 
including attendee name, purchase date, and the full-price and concession ticket counts, so the organiser can see who bought tickets
Inputs: URL param :id for the event, and req.session.organiserId
Outputs: renders organiser-event-sales.ejs with the event and its bookings
or the error page when the event does not exist or is not owned by this organiser
*/
router.get('/events/:id/sales', (req, res) => {
    const eventId = req.params.id;
    const organiserId = req.session.organiserId;

    /*
    DB interaction: confirm the event exists and belongs to this organiser
    Purpose: stop an organiser viewing the sales report of another organiser through a guessed URL
    Inputs: event_id, organiser_id
    Outputs: the matching event row, or undefined when not found or not owned
    */
    global.db.get('SELECT * FROM events WHERE event_id = ? AND organiser_id = ?', [eventId, organiserId], (findErr, event) => {
        if (findErr) {
            return renderError(res, 500, 'Failed to load event.');
        }
        if (!event) {
            return renderError(res, 404, 'Event not found or not owned by this organiser.');
        }

        /*
        DB interaction: fetch every booking against this event most recent first
        Purpose: populate the sales report table
        Inputs: event_id
        Outputs: booking rows with attendee_name, booked_at, full_price_count and concession_count
        */
        global.db.all(
            `SELECT attendee_name, booked_at, full_price_count, concession_count
             FROM bookings WHERE event_id = ? ORDER BY booked_at DESC`,
            [eventId],
            (bookingsErr, bookings) => {
                if (bookingsErr) {
                    return renderError(res, 500, 'Failed to load bookings.');
                }

                /* The totals row is summed here from the rows rather than with a second database */
                const totals = bookings.reduce(
                    (acc, booking) => {
                        acc.full_price_count += booking.full_price_count;
                        acc.concession_count += booking.concession_count;
                        return acc;
                    },
                    { full_price_count: 0, concession_count: 0 }
                );

                res.render('organiser-event-sales', { event: event, bookings: bookings, totals: totals });
            }
        );
    });
});

module.exports = router;

//end 
