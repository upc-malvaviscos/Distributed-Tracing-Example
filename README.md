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

# 3. Observability: Alloy + Tempo + Prometheus + Grafana
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

### Cleanup

```bash
docker compose down -v && docker compose -f docker-compose.obs.yml down -v
docker network rm kennels_net
```
