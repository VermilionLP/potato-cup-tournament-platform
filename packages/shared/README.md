# @potato-cup/shared

Rules the API (`apps/api`) and the website (`apps/web`) must apply the same
way, kept in one place so they cannot drift apart:

- `banpick.js` — Ban / Pick: rules, state transitions (`step`), the server's
  logged actions (`act`, `actionProblem`, undo and reset by replaying the
  log), the website's local preview (`localAct`) and who may do what
  (`mayAct`).
- `vehicle-pools.js` — vehicle pool templates: cleaning vehicles and
  templates for storage, and which template an event uses
  (`resolveTemplate`).

Plain ES modules without dependencies. Import as
`@potato-cup/shared/banpick.js`; both apps list the package as
`"@potato-cup/shared": "workspace:*"`. Texts are Chinese (the site's
language); the website translates them like any other text.
