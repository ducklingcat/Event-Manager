/**
* index.js
* This is your main app entry point.
*/

// Set up express, bodyparser and EJS
const express = require('express');
const session = require('express-session');
const app = express();
const port = 3000;
app.use(express.urlencoded({ extended: true }));
//start
/* Set up sessions. Each browser gets a signed session cookie so routes/organiser.js can
   tell whether an organiser is logged in. */
app.use(session({
    secret: 'event-manager-dev-secret',
    resave: false,
    saveUninitialized: false
}));

app.set('view engine', 'ejs'); // set the app to use ejs for rendering
app.use(express.static(__dirname + '/public')); // set location of static files

/* Registered on app.locals so formatDateTime can be called directly inside every EJS
   template without each route passing it through res.render. */
app.locals.formatDateTime = require('./lib/formatDateTime');
//end
// Set up SQLite
// Items in the global namespace are accessible throught out the node application
// Set up SQLite
// Items in the global namespace are accessible throught out the node application
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

global.db = new sqlite3.Database('./database.db', function (err) {
    if (err) {
        console.error(err);
        process.exit(1); // bail out, we can't connect to the DB
    } else {
        console.log('Database connected');
        global.db.run('PRAGMA foreign_keys=ON'); // tell SQLite to pay attention to foreign key constraints

        // Auto-rebuild the database on server startup
        const schemaPath = path.join(__dirname, 'db_schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        global.db.exec(schema, (execErr) => {
            if (execErr) {
                console.error('Failed to seed database:', execErr);
            } else {
                console.log('Database rebuilt successfully.');
            }
        });
    }
});

/*
Route: Main Home Page
Purpose: default landing page of the application
Inputs: none
Outputs: renders index.ejs with links to the Organiser Home Page and Attendee Home Page
*/
app.get('/', (req, res) => {
    res.render('index');
});

// Add all the route handlers in organiserRoutes to the app under the path /organiser
const organiserRoutes = require('./routes/organiser');
app.use('/organiser', organiserRoutes);

// Add all the route handlers in attendeeRoutes to the app under the path /attendee
const attendeeRoutes = require('./routes/attendee');
app.use('/attendee', attendeeRoutes);

// Make the web application listen for HTTP requests
app.listen(port, () => {
    console.log(`Event Manager app listening on port ${port}`)
});
