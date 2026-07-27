// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://3863b9fb1397a253c7275398ef2c8391@o4511796131397632.ingest.de.sentry.io/4511796167573584",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  dataCollection: {
    // httpBodies disabled: Sentry's instrumentation reads the request body
    // for error/breadcrumb capture, which drains the stream -- any route
    // handler that then calls request.json() itself (e.g.
    // api/v1/auth/desktop-session) gets an empty body and throws
    // "Unexpected end of JSON input". See:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    httpBodies: [],
  },
});
