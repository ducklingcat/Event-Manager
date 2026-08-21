//start

/*
Purpose of attendee.js: covers the Attendee Home Page and the Attendee Event Page with
booking form.

The home page lists published events from every organiser combined, each event carries
the site name and description of its hosting organiser so attendees always see who is
running an event.
*/

const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const renderError = require('../lib/renderError');

/* fetch one event together with the site_settings row of the hosting organiser 
so a single query also returns the host's public name and description
used by: the Attendee Event Page and the booking route which both need the same event and host data
*/
const EVENT_WITH_ORGANISER_SQL = `
    SELECT events.*, site_settings.site_name AS organiser_site_name,
           site_settings.site_description AS organiser_site_description
    FROM events
    JOIN site_settings ON events.organiser_id = site_settings.organiser_id
    WHERE events.event_id = ?`;

/*
Purpose: sum the tickets already booked for an event, split by ticket type.
Shared by the event page and the booking route so both work from the same numbers
Inputs: event_id, and a callback that receives an error or the summed totals
Outputs: calls back with full_booked and concession_booked. COALESCE reports 0 rather than NULL when the event has no bookings
*/
function getBookingTotals(eventId, callback) {
    global.db.get(
        `SELECT COALESCE(SUM(full_price_count), 0) AS full_booked,
                COALESCE(SUM(concession_count), 0) AS concession_booked
         FROM bookings WHERE event_id = ?`,
        [eventId],
        callback
    );
}

/*
Route: Attendee Home Page
Purpose: list the published events from every organiser soonest first, each with the name and description of its hosting organiser
Inputs: nil
Outputs: renders attendee-home.ejs with the list of published events
*/
router.get('/', (req, res) => {
    /*
    DB interaction: fetch the published events from every organiser, joined with the site_settings of their hosts ordered by event date
    Purpose: populate the attendee list of bookable events with each organiser's details shown against the event they belong to
    Inputs: nil
    Outputs: event rows where state is published, each with organiser_site_name and organiser_site_description ordered by event_date
    */
    global.db.all(
        `SELECT events.*, site_settings.site_name AS organiser_site_name,
                site_settings.site_description AS organiser_site_description
         FROM events
         JOIN site_settings ON events.organiser_id = site_settings.organiser_id
         WHERE events.state = 'published'
         ORDER BY events.event_date ASC`,
        (eventsErr, publishedEvents) => {
            if (eventsErr) {
                return renderError(res, 500, 'Failed to load events.');
            }
            res.render('attendee-home', { publishedEvents: publishedEvents });
        }
    );
});

/*
Route: Attendee Event Page
Purpose: show a single published event with its description, hosting organiser, live ticket availability per type and the booking form
Inputs: URL param :id for the event
Outputs: renders attendee-event.ejs with the event and its remaining ticket counts or the 404 page when the event is not found
*/
router.get('/events/:id', (req, res) => {
    const eventId = req.params.id;

    /*
    DB interaction: fetch the event together with the site_settings of its hosting organiser
    Purpose: show the event details, the host's name and description, and power the booking form
    Inputs: event_id
    Outputs: the matching event row with organiser_site_name and organiser_site_description, or undefined when not found
    */
    global.db.get(EVENT_WITH_ORGANISER_SQL, [eventId], (err, event) => {
        if (err) {
            return renderError(res, 500, 'Failed to load event.');
        }
        /* Not found and not published share the same 404 message */
        if (!event || event.state !== 'published') {
            return renderError(res, 404, 'Event not found.');
        }

        /*
        DB interaction: sum the tickets already booked for this event, by type
        Purpose: show attendees how many tickets of each type actually remain, not just the original capacity
        Inputs: event_id
        Outputs: full_booked and concession_booked
        */
        getBookingTotals(eventId, (sumErr, totals) => {
            if (sumErr) {
                return renderError(res, 500, 'Failed to check ticket availability.');
            }

            event.full_price_available = event.full_price_tickets - totals.full_booked;
            event.concession_available = event.concession_tickets - totals.concession_booked;

            /* Flag for the page banner that warns the event has already taken place.
            */
            const today = new Date().toISOString().slice(0, 10);
            event.isPast = Boolean(event.event_date) && event.event_date < today;

            res.render('attendee-event', { event: event, errors: [], formValues: {} });
        });
    });
});

/*
Route: Book Tickets
Purpose: validate an attendee's booking and record it. Blocks booking more tickets than remaining and booking a draft or past event.
Inputs: URL param :id for the event, and req.body with attendee_name, full_price_count and concession_count
Outputs: inserts a booking row and redirects to the Attendee Home Page on success or re renders the event page with error messages on failure

Two ticket count checks run as express-validator chains (accepts 0 means none of that type).
Name, at least one ticket of a type, is it past event and availability checks are business rules and stay as manual checks
*/
router.post('/events/:id/book', [
    check('full_price_count', 'Number of full-price tickets must be a whole number that is 0 or greater.').trim().optional({ checkFalsy: true }).isInt({ min: 0 }),
    check('concession_count', 'Number of concession tickets must be a whole number that is 0 or greater.').trim().optional({ checkFalsy: true }).isInt({ min: 0 })
], (req, res) => {
    const eventId = req.params.id;
    const attendeeName = (req.body.attendee_name || '').trim();
    const fullPriceCountRaw = (req.body.full_price_count || '').trim();
    const concessionCountRaw = (req.body.concession_count || '').trim();

    /*
    DB interaction: fetch the event being booked with the site_settings of its host
    Purpose: read the ticket capacity to check the booking against and have the host details ready in case of errors
    Inputs: event_id
    Outputs: the matching event row with organiser_site_name and organiser_site_description or undefined when not found
    */
    global.db.get(EVENT_WITH_ORGANISER_SQL, [eventId], (eventErr, event) => {
        if (eventErr) {
            return renderError(res, 500, 'Failed to load event.');
        }
        /* Not found, not published and blocks booking a draft event directly share the same 404 message as the event page */
        if (!event || event.state !== 'published') {
            return renderError(res, 404, 'Event not found.');
        }

        /*
        DB interaction: sum the tickets already booked for this event by type
        Purpose: work out how many tickets of each type remain before accepting this booking 
        so an attendee can never book more than are available. Attached to the event so every render shows accurate live availability
        Inputs: event_id
        Outputs: full_booked and concession_booked
        */
        getBookingTotals(eventId, (sumErr, totals) => {
            if (sumErr) {
                return renderError(res, 500, 'Failed to check ticket availability.');
            }

            const fullAvailable = event.full_price_tickets - totals.full_booked;
            const concessionAvailable = event.concession_tickets - totals.concession_booked;
            event.full_price_available = fullAvailable;
            event.concession_available = concessionAvailable;

            const errors = [];
            if (!attendeeName) {
                errors.push('Please enter your name.');
            }

            /* A field missing from mapped() means it passed validation. That gives a true/false
            flag for each field used below to decide whether to parse and check its count. */
            const mappedErrors = validationResult(req).mapped();
            const fullPriceCountValid = !mappedErrors.full_price_count;
            const concessionCountValid = !mappedErrors.concession_count;
            Object.values(mappedErrors).forEach((error) => {
                errors.push(error.msg);
            });

            const fullPriceCount = fullPriceCountValid ? (fullPriceCountRaw === '' ? 0 : parseInt(fullPriceCountRaw, 10)) : 0;
            const concessionCount = concessionCountValid ? (concessionCountRaw === '' ? 0 : parseInt(concessionCountRaw, 10)) : 0;

            if (fullPriceCountValid && concessionCountValid && fullPriceCount === 0 && concessionCount === 0) {
                errors.push('Please select at least one ticket.');
            }

            /* Block booking an event that has already happened. The edit form stops an
               organiser setting a past date but a date becomes the past on its own once
               the calendar moves on, so it has to be checked again at booking time. It is
               skipped when no date has been set. */
            const today = new Date().toISOString().slice(0, 10);
            if (event.event_date && event.event_date < today) {
                errors.push('This event has already taken place and can no longer be booked.');
            }

            if (fullPriceCountValid && fullPriceCount > fullAvailable) {
                errors.push(`Only ${fullAvailable} full-price ticket(s) remaining.`);
            }
            if (concessionCountValid && concessionCount > concessionAvailable) {
                errors.push(`Only ${concessionAvailable} concession ticket(s) remaining.`);
            }

            if (errors.length > 0) {
                return res.render('attendee-event', { event: event, errors: errors, formValues: req.body });
            }

            const now = new Date().toISOString();

            /*
            DB interaction: insert the booking
            Purpose: record the attendee's ticket purchase against this event
            Inputs: event_id, attendee_name, full_price_count, concession_count, booked_at
            Outputs: a new booking row
            */
            global.db.run(
                `INSERT INTO bookings (event_id, attendee_name, full_price_count, concession_count, booked_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [eventId, attendeeName, fullPriceCount, concessionCount, now],
                (bookErr) => {
                    if (bookErr) {
                        return renderError(res, 500, 'Failed to record booking.');
                    }
                    res.redirect('/attendee');
                }
            );
        });
    });
});

module.exports = router;

//end