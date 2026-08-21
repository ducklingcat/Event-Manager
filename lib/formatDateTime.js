//start

/*
Purpose of formatDateTime.js: turns the raw ISO timestamps stored in created_at,
published_at, modified_at and booked_at into a readable format for display. Registered
on app.locals in index.js so every EJS template can call it directly.
*/

const MONTH_ABBREVIATIONS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/*
Purpose: format a stored timestamp into a shorter "month date, HH:MM" when the timestamp is not needed
Inputs: an ISO timestamp string, and a compact flag
Outputs: the formatted string or "Not set" if empty
*/
function formatDateTime(isoString, options) {
    if (!isoString) {
        return 'Not set';
    }
    if (options && options.compact) {
        const month = MONTH_ABBREVIATIONS[parseInt(isoString.slice(5, 7), 10) - 1];
        const day = parseInt(isoString.slice(8, 10), 10);
        const time = isoString.slice(11, 16);
        return `${month} ${day}, ${time}`;
    }
    return isoString.slice(0, 16).replace('T', ' ');
}

module.exports = formatDateTime;

//end