---
name: cap-conventions
description: Use when creating, renaming or moving files under srv/ or db/, adding or editing a CDS service, importing an external OData service with cds import, editing cds.requires, or touching xs-app.json or mta.yaml.
---

# CAP file and folder conventions

Structure only — file names, folder layout, module organization. CDS modelling
and CAP runtime behaviour are not this skill's concern.

## Before creating a file

- **Any file under `srv/` or `db/`** — `references/naming-cap.md`
- **Any `.ts` file** — `references/typescript-layout.md`
- **Any test** — `references/testing.md`
- **`xs-app.json` or `mta.yaml`** — `references/approuter.md`

## The rules in one screen

```
srv/
  price-view-service.cds        kebab, <domain>-service.cds
  price-view-service.ts         handler, same basename as its .cds
  pos/
    pos-determination.ts        kebab
    types.ts                    shared types, nearest common folder
    constants.ts
  external/
    SalesOrderSimulation.cds    PascalCase alias (see below)
db/
  schema.cds
test/
  pos/pos-determination.test.ts mirrors srv/, never beside the module
```

Filenames are kebab-case. Inside CDS, services and entities are PascalCase,
elements camelCase.

A **handler registers events and delegates.** Logic lives in the domain modules
beside it — that is what keeps it under the 500-line limit.

## External services: one name in three places

```
cds.requires key  ==  srv/external/<basename>  ==  service <Name> { }
```

The filename is not wire contract — `credentials.destination` and
`credentials.path` do the binding. The name is a **PascalCase logical alias**,
for OData and hand-written REST alike. Never `ZAPI_SALES_ORDER_SIMULATION_SRV`
or `zchangenotifications`.

### After every `cds import`, rename four things together

`cds import` names the file after the remote service, so it always produces
drift:

1. `srv/external/<Generated>.cds` -> `srv/external/<Alias>.cds`
2. `service <Generated>` -> `service <Alias>` inside the file
3. the `cds.requires` key
4. `model: "srv/external/<Alias>"`

Keep the backend service id in `credentials.path` and in a header comment.
Retained metadata is `.edmx`, never `.xml`.
