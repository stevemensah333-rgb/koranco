# API conventions

## Operational list pagination

Operational resource lists use `limit` and `offset` query parameters. Defaults are `limit=50` and `offset=0`; limit must be 1–100. Responses consistently contain:

```json
{
  "items": [],
  "total": 0,
  "limit": 50,
  "offset": 0
}
```

`total` is the number of records matching the current filters before pagination. Later attendance, harvest, and reporting endpoints should reuse this convention unless measured scale or interaction requirements justify a reviewed alternative.
