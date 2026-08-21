# Event Manager

## Overview
Event Manager is a multi-tenant application designed to streamline event creation and ticketing. It allows event organizers to easily publish and manage events while providing attendees with a seamless booking experience. 

## Key Features
*   **Multi-Tenant Architecture:** Organizers register private accounts to independently manage their exclusive events and site settings.
*   **Sales Dashboard:** Organizers can track the performance of their published events using a visual pie chart breakdown of ticket sales.
*   **Event Lifecycle Management:** Events can be saved as drafts and safely edited before being published to the public attendee board.
*   **Smart Booking System:** Real-time capacity checks automatically prevent overbooking across both full-price and concession ticket tiers.

## Live Demo & Access
The application is currently hosted on Render. Because it utilizes a free tier, the server may take approximately 30 seconds to wake up upon your first visit.
*   **Live Link:** [Insert your Render URL here]
*   **Demo Username:** `organiser`
*   **Demo Password:** `password123!`
*   *Note:* The database resets automatically when the server sleeps, ensuring a fresh environment with pre-seeded example data for every new session.

## Technical Details
*   **Core Stack:** Built with Node.js, Express, SQLite3, and EJS for server-rendered templates.
*   **Security:** Utilizes `bcrypt` for secure password hashing and `express-session` for session management without storing state client-side.
*   **Data Integrity:** Implements `express-validator` for robust server-side validation of all form submissions.
*   **Local Setup:** To run locally, install dependencies with `npm install`, build the database with `npm run build-db`, and start the server using `npm run start`.