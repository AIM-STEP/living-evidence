
### Private TypeSafe configuration

The local backend reads `../private/typesafe.json` (outside the static website root) on each TypeSafe request:

```json
{
  "apiKey": "",
  "model": ""
}
```

On the Mac Studio this is `/Users/achieve/AIM-STEP/private/typesafe.json`. Fill `apiKey` with the real key. Leave `model` empty to retain the previously available model or select the first available model; alternatively set an exact model name returned by TypeSafe. Keep the directory mode 700 and file mode 600, and never copy this file into the website or commit it. The parent project ignores `private/`. Replace the key in this one file to rotate it; no backend restart is needed. Refresh the tool page after changing the configured model.

Title/abstract screening and Full-text assess connect automatically through the local backend. The key is added only by the server and is not returned to the browser. The existing Mac Studio connection/SSH tunnel is still required. A missing key produces a configuration error instead of using a local model. Eligibility criteria and Search strategy continue using local models.

### Eligibility criteria v3

The established English interface is retained. Research-question extraction, necessary clarification, traceable inclusion/exclusion clauses and revisions run as background methodology through the existing HTML/JavaScript application and model backend. Run `python3 tools/local_model_server.py`, open the homepage and select a registered project's Eligibility criteria tool.

See [the technical specification](docs/eligibility-spec.md), [implementation and startup instructions](docs/eligibility-implementation.md), and [program/real-model evaluation records](docs/eligibility-evaluation/README.md). Program fixtures and real model observations are reported separately.
