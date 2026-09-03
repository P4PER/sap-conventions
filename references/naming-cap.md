# Naming — CAP (`srv/`, `db/`)

Filenames are kebab-case. Identifiers inside CDS are PascalCase for services and
entities, camelCase for elements.

```cds
service PriceViewService {
    entity QuoteItems {
        itemNumber : String;
    }
}
```

## Files are kebab-case   `cap-filename-case`

```
srv/pos/pos-determination.ts
srv/pricing/response-mapper.ts
db/pos-tickets.cds
```

Rationale: CAP capire ships kebab-case (`cat-service.js`, `admin-service.js`).
`srv/external/` is exempt — see below.

## Service definitions are `<domain>-service.cds`   `cap-service-name`

At least two kebab segments, ending in `-service`. A bare `srv/service.cds` is a
violation: it says nothing about which service it is.

## A service definition has a handler with the same basename   `cap-handler-pairing`

```
srv/price-view-service.cds  ->  srv/price-view-service.ts
```

A handler registers events and delegates. The logic lives in the domain modules
beside it — see [typescript-layout.md](typescript-layout.md) for the size limits
that keep it that way.

## External services: one name in three places   `external-identity`

```
cds.requires key  ==  srv/external/<basename>  ==  service <Name> { } in the file
```

All three must agree. The filename is **not** wire contract — binding to the
backend is done by `credentials.destination` and `credentials.path`. The name is
free; the identity across the three places is not.

```json
"SalesOrderSimulation": {
  "kind": "odata-v2",
  "model": "srv/external/SalesOrderSimulation",
  "credentials": {
    "destination": "S4-PROD",
    "path": "/sap/opu/odata/sap/API_SALES_ORDER_SIMULATION_SRV"
  }
}
```

## External service names are a PascalCase logical alias   `external-name-style`

One rule for OData and REST alike:

```
srv/external/C4C.cds                      service C4C
srv/external/C4cPartyDetermination.cds    service C4cPartyDetermination
srv/external/SalesOrderSimulation.cds     service SalesOrderSimulation
srv/external/CpiPricing.cds               service CpiPricing
```

Not `ZAPI_SALES_ORDER_SIMULATION_SRV`, not `zchangenotifications`. The backend
service id stays recoverable from `credentials.path`, and belongs in a header
comment in the `.cds` file.

Rejected alternative: mirroring the SAP service id verbatim. It costs no rename
after `cds import`, but hand-written REST services have no SAP id, so the folder
stays permanently mixed-case.

### After every `cds import`

The generated file is named after the remote service, so four things need
renaming together:

1. `srv/external/<Generated>.cds` -> `srv/external/<Alias>.cds`
2. `service <Generated>` -> `service <Alias>` inside that file
3. the `cds.requires` key
4. `model: "srv/external/<Alias>"`

## Retained metadata is `.edmx`   `external-metadata-ext`

The downloaded metadata kept next to the model uses `.edmx`, never `.xml`.
