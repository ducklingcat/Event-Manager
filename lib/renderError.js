//start

/*
Purpose of renderError.js: sends errors as a styled page instead of bare text from res.status().send()
*/

/*
Purpose: send an error as a styled page instead of raw text
Inputs: Express response, an HTTP status code, and a message string
Outputs: renders views/error.ejs with the message
*/
function renderError(res, statusCode, message) {
    res.status(statusCode).render('error', { message: message });
}

module.exports = renderError;

//end