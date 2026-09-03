# Approuter and MTA

## `app/router/xs-app.json`

### The file parses   `router-parse`

If `xs-app.json` is not valid JSON, that is the only finding reported for it —
no route rule can be evaluated until it parses.

### `authenticationMethod` is `"route"`   `router-auth-method`

### Every route sets `authenticationType`   `router-auth-type`

Usually `"xsuaa"`. A route without one is a violation — an unauthenticated route
is a decision, not a default.

### The catch-all route is last   `router-route-order`

Routes are ordered specific first, catch-all last. Anything after `^(.*)$` is
unreachable.

```json
{
  "welcomeFile": "/priceview/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/odata/(.*)$",
      "target": "/odata/$1",
      "destination": "srv-api",
      "csrfProtection": true,
      "authenticationType": "xsuaa"
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa",
      "cacheControl": "no-cache, must-revalidate"
    }
  ]
}
```

### The catch-all sets `cacheControl`   `router-cache-control`

`"no-cache, must-revalidate"`, so a redeployed app is not served stale.

### `csrfProtection` on write-capable destination routes

### A `cors` block only when the app is embedded in C4C

Not a check — it depends on where the app is hosted. Present for C4C-embedded
apps, absent otherwise.

## `mta.yaml`

### Module and resource names derive from `ID`   `mta-name-prefix`

```
ID: <mta-id>
  <mta-id>-srv              nodejs,  path gen/srv
  <mta-id>                  approuter.nodejs, path app/router
  <mta-id>-ui-deployer      com.sap.application.content
  <mta-id>-ui               html5,   path app/<app-id>
  <mta-id>-auth | -destination | -connectivity | -html5-host | -html5-runtime
```

`srv-api` and `app-api` are the exceptions — they are cross-module provide/require
names, not owned by this MTA.

### The app folder aligns with the MTA ID   `mta-app-id`

`app/<app-id>/` must match the UI5 namespace, the `welcomeFile` path segment and
the `<mta-id>-ui` module. `<app-id>` is lowercase with no separators, because it
becomes a UI5 namespace segment.

Reported as a **question**: an MTA `ID: change-notification` against
`app/changenotifications` can be fixed from either side, and renaming the app
folder moves the UI5 namespace with it. That is your call, not the audit's.
