# Distributed Tracing Example

This repository contains the base code to implement Tracing observability with `OpenTelemetry`

Check the Grafana guide for more info:
(https://grafana.com/blog/2021/09/23/intro-to-distributed-tracing-with-tempo-opentelemetry-and-grafana-cloud/)

## Running the stack

The application and the observability stack share the external Docker network `kennels_net`.

```bash
# 1. Shared network (once)
docker network create -d bridge kennels_net

# 2. Application: nginx + kennels + dogs + inventory
docker compose up -d --build --force-recreate

# 3. Observability: Alloy + Tempo + Prometheus + Grafana + blackbox-exporter
docker compose -f docker-compose.obs.yml up -d --force-recreate
```

| Component  | Role                                                        | Access                         |
|------------|-------------------------------------------------------------|--------------------------------|
| Alloy      | OTLP collector (gRPC `4317`, HTTP `4318`), batches and forwards traces to Tempo | UI at http://localhost:12345 |
| Tempo      | Trace backend; its metrics generator writes service-graph and span metrics to Prometheus | `tempo:3200` (internal) |
| Prometheus | Metrics backend, receives Tempo metrics via `remote_write`  | `prometheus:9090` (internal)   |
| Grafana    | Visualization, datasources provisioned from `obs/grafana/provisioning` | http://localhost:3000 |

Configuration files:

- `obs/config.alloy` – OTLP receiver → batch processor → OTLP exporter to Tempo.
- `obs/tempo.yaml` – OTLP distributor, `metrics_generator` with `remote_write` to Prometheus, local storage, `service-graphs` / `span-metrics` / `local-blocks` processors.
- `obs/grafana/provisioning/datasources/datasources.yaml` – Prometheus and Tempo datasources; Tempo uses Prometheus for the service graph.

### Validation

```bash
# All containers (alloy, grafana, tempo, prometheus) must be "running"
docker compose -f docker-compose.obs.yml ps -a

# The application answers through nginx
curl "http://localhost:8080/api/v1/kennels?id=0"
# {"name":"awesome kennel","dogs":[{"id":0,"name":"Rufus"}]}
```

In Grafana go to *Connections → Data sources*: `Prometheus` and `Tempo` should be listed, and Tempo's *Additional settings → Service graph* should point to `Prometheus`.

### HTTP availability probes (issue #4)

`obs/blackbox.yml` defines the `http_2xx` module: GET requests, redirects enabled,
5-second timeout, IPv4 preferred and normal TLS certificate validation.
`obs/prometheus.yml` scrapes both targets through blackbox-exporter every 15 seconds:

- `http://nginx/api/v1/kennels/health`
- `https://upcschool.upc.edu`

The local health route returns HTTP 200 with `{"status":"ok"}` when `kennels` is
reachable through nginx. It checks availability of that service, not the health
of downstream `dogs` or `inventory` or the success of business requests.

After changing the configuration, recreate the observability containers and
rebuild `kennels`:

```bash
docker compose up -d --build kennels
docker compose -f docker-compose.obs.yml up -d --force-recreate
curl http://localhost:8080/api/v1/kennels/health
docker compose -f docker-compose.obs.yml exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

In Grafana, open *Dashboards → New → Import*, enter dashboard ID
[16124](https://grafana.com/grafana/dashboards/16124-blackbox-exporter/), load and
import it, and select `Prometheus` as the data source. Select job `blackbox`.
The hidden cluster variable uses the `cluster="docker-compose"` label on the probes.
Use a time range of the last 15 minutes and a 15-second refresh interval.
The summary shows both targets; select each *Instance* to inspect its details.

In *Explore → Prometheus*, validate:

- `up{job="blackbox"}`: two series with value 1 mean Prometheus can scrape the probes.
- `probe_success{job="blackbox"}`: 1 means the target returned a successful HTTP response; 0 means it failed.
- `probe_http_status_code{job="blackbox"}`: HTTP response code.
- `probe_duration_seconds{job="blackbox"}`: probe duration in seconds.

To check failure detection, stop only this application's `kennels` container:

```bash
docker compose stop kennels
# Wait at least 15 seconds: local probe_success should become 0; UPCSchool stays independent.
docker compose start kennels
```

Wait for the local probe to return to 1, then save a screenshot of the dashboard
with both targets visible under `img/blackbox-dashboard.jpg` for the lab hand-in.
If a probe fails, inspect exporter logs with
`docker compose -f docker-compose.obs.yml logs --tail=50 blackbox-exporter`.

Validation performed on 2026-10-19: both targets returned `probe_success=1`;
stopping `kennels` changed only the local probe to 0, and starting it restored 1.
Both Prometheus scrapes remained healthy. The nginx proxy preserves the original
path so the health route does not receive an extra leading slash.

![Blackbox Exporter dashboard with both HTTP targets](img/blackbox-dashboard.jpg)

### Cleanup

```bash
docker compose down -v && docker compose -f docker-compose.obs.yml down -v
docker network rm kennels_net
```
