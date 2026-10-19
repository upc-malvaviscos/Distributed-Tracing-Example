# Laboratori 8.5 - Distributed Tracing

En este laboratorio aprenderemos a generar y consultar trazas distribuidas a partir del stack `LGTM` de Grafana. En concreto, veremos cómo usar [`Tempo`](https://grafana.com/oss/tempo/) y [OpenTelemetry](https://opentelemetry.io/)

Antes de entrar en detalle en la instrumentación de aplicaciones, veremos cómo trabajar con trazas a partir de datos sintéticos generados con una extensión de [Grafana k6](https://k6.io/), una aplicación diseñada para diseñar y ejecutar pruebas de carga y de validación. En concreto, usaremos [xk6-client-tracing](https://github.com/grafana/xk6-client-tracing).

## Toma de contacto con las trazas

1.1 - Revisa el archivo docker-compose.yml donde verás los servicios que se desplegarán en esta parte de la práctica. En concreto, desplegaremos los siguientes servicios:
- Prometheus (Backend de métricas)
- Tempo (Backend de Trazas)
- Grafana (Dashboards)
- xk6-client-tracing (Generador de trazas)

1.2 - Fíjate en la configuración de Tempo que se encuentra en `./configs/tempo.yaml`, aquí es donde definiremos todos los parámetros de configuración, en concreto, definiremos los protocolos que admite el `distributor`, el componente que recibe las trazas en los diferentes protocolos definidos y los dirige al `ingester` para su procesamiento.

```yaml
distributor:
  receivers:
    otlp:
      protocols:
        http:
        grpc:
```

Además, Tempo es capaz de generar métricas a partir del procesamiento de las trazas. Estas métricas se publicarán en Prometheus mediante `remote_write`. Deberemos consultar Prometheus para poder obtener métricas de las trazas y generar el `service map` que veremos más adelante.

```yaml
metrics_generator:
  registry:
    external_labels:
      source: tempo
      cluster: docker-compose
  storage:
    path: /var/tempo/generator/wal
    remote_write:
      - url: http://prometheus:9090/api/v1/write
        send_exemplars: true
```

1.3- Desplegaremos `Grafana` y `Prometheus`, definidos en el `docker-compose.yml`, que nos hará falta para poder visualizar las trazas y monitorizar las métricas asociadas a estas.

```bash
docker compose up grafana prometheus -d
```

1.4 - Accedemos a la UI de Grafana (http://localhost:3000) y configuraremos el Datasource Prometheus que hemos desplegado. Recuerda que puedes referenciar Prometheus desde Grafana con la red interna de Docker (http://prometheus:9090)

![alt text](./img/prom_conf.png)

> Con la configuración por defecto debería ser suficiente, ya que el servicio no está autenticado.

1.5 - Desplegaremos la instancia de `Tempo` con Docker Compose

```bash
docker compose up tempo -d
```

1.6 - Configuraremos el datasource de Tempo mediante la interfaz de Grafana. En este caso el endpoint de Tempo es `http://tempo:3200`

![alt text](./img/tempo_conf.png)

En el apartado `Additional Settings` tendrás que configurar el datasource de `Prometheus` que hemos creado anteriormente como fuente de datos para la generación del `Service Graph`.

1.7 - A continuación, accederemos al explorador de datos, y escogeremos el datasource de `Tempo`

![alt text](./img/empty_ds.png)

1.8 - Como podéis observar, aún no tenemos datos. Ejecutaremos la herramienta `xk6-client-tracing` para generar trazas realistas y enviarlas al endpoint `tempo:4317` usando el protocolo [otlp](https://opentelemetry.io/docs/specs/otel/protocol/) sobre [gRPC](https://grpc.io/)

```bash
docker compose up k6-tracing -d
```

1.9 - Espera unos minutos a que se empiecen a generar datos. Accede a la visualización de `Service Graph` para ver todos los componentes asociados a las trazas y las interacciones entre estos. Deberías ver algo parecido a esto:

![alt text](./img/service_graph.png)

1.10 - Como puedes ver, se están detectando algunos errores en el `Auth-Service`, ¿puedes intentar descubrir en qué función se produce este error en particular?

<details><summary>Solución</summary>

![](./img/res_pregunta1.png)

</details>

1.11 - En este punto, podemos borrar la aplicación que hemos desplegado para continuar con la segunda parte del Laboratorio

```bash
docker compose down -v
```

## Instrumentación de una aplicación (Entregable)


> Esta parte de la práctica és un entregable (*Deadline 21/10/2026*)

Disponemos de una API para la gestión de perreras (`kennels`), que está basada en NodeJS. Nos han pedido que la instrumentalicemos con [OpenTelemetry](https://opentelemetry.io/) y generemos trazas sobre esta. ¿La puedes instrumentalizar?

2.0 - Haz un Fork de la rama main del repositorio `https://github.com/mcatrisse/Distributed-Tracing-Example` para persistir los cambios. Este deberá ser **PRIVADO**

2.1 - Haz clone del proyecto que vamos a instrumentalizar (vuestro fork)

```bash
git clone https://github.com/<VUESTRO NOMBRE>/Distributed-Tracing-Example
cd Distributed-Tracing-Example
```

2.3 - Crearemos una red Docker, donde desplegaremos todos los microservicios. Posteriormente, utilizaremos la misma red de Docker para desplegar el stack de monitorización

```bash
docker network create -d bridge kennels_net
```

2.4 - Ejecuta el Stack de la aplicación y verifica que funciona correctamente

```bash
docker compose up -d --build --force-recreate
```
> Si consultáis el endpoint `/api/v1/kennels`, os debería devolver información sobre los perros que residen en esa perrera

```bash
curl http://localhost:8080/api/v1/kennels?id=0

{"name":"awesome kennel","dogs":[{"id":0,"name":"Rufus"}]}
```
2.5 - Añadiremos un nuevo archivo docker-compose que desplegará el stack de monitorización que usaremos para almacenar y visualizar las trazas.

Crearemos un nuevo archivo llamado docker-compose.obs.yml con el siguiente contenido
```yaml
name: kennels_stack
volumes:
  grafana_data: {}
  tempo_data: {}
networks:
  kennels_net:
    external: true
services:
  alloy:
    image: grafana/alloy:v1.9.1
    volumes:
      - ./obs/config.alloy:/etc/alloy/config.alloy
    command:
    - run
    - /etc/alloy/config.alloy
    - --server.http.listen-addr=0.0.0.0:12345
    ports:
      - 12345:12345
    networks:
      - kennels_net
  grafana:
    image: grafana/grafana:13.2.4
    restart: unless-stopped
    ports:
      - 3000:3000
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
      - GF_AUTH_DISABLE_LOGIN_FORM=true
      - GF_FEATURE_TOGGLES_ENABLE=traceqlEditor traceQLStreaming metricsSummary
    networks:
      - kennels_net
  tempo:
    image: grafana/tempo:3.1.0
    command: [ "-config.file=/etc/tempo.yaml" ]
    volumes:
      - ./obs/tempo.yaml:/etc/tempo.yaml
      - tempo_data:/var/tempo
    networks:
      - kennels_net
  prometheus:
    image: prom/prometheus:v3.13.4
    restart: unless-stopped
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.enable-remote-write-receiver"
      - "--enable-feature=exemplar-storage"
    networks:
      - kennels_net
```
Revisa el stack e identifica los componentes que hemos visto para la monitorización de aplicaciones con trazas.

2.6 - Despliega el stack de monitorización que hemos definido anteriormente

```bash
docker compose -f docker-compose.obs.yml up -d
```

Como puedes ver, el despliegue no funciona correctamente, ya que no hemos definido los archivos de configuración de los componentes.

```bash
docker compose -f docker-compose.obs.yml ps -a
```

2.7 - Crea la carpeta obs y añade los archivos de configuración de los componentes

```bash
sudo rm -rf obs && mkdir obs
```
`config.alloy`

```bash
cat << EOF > obs/config.alloy
livedebugging {
  enabled = true
}

logging {
  level  = "info"
  format = "logfmt"
}

otelcol.receiver.otlp "receiver" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }

  http {
    endpoint = "0.0.0.0:4318"
  }

  output {
    traces  = [otelcol.processor.batch.pipeline.input]
  }
}

otelcol.processor.batch "pipeline" {
  output {
    traces  = [otelcol.exporter.otlp.tempo.input]
  }
}

otelcol.exporter.otlp "tempo" {
  client {
    endpoint = "tempo:4317"
    tls {
      insecure = true
      insecure_skip_verify = true
    }
  }
}

EOF
```
`tempo.yaml`

```bash
cat << EOF > obs/tempo.yaml
stream_over_http_enabled: true
server:
  http_listen_port: 3200
  log_level: info

query_frontend:
  search:
    duration_slo: 5s
    throughput_bytes_slo: 1.073741824e+09
  trace_by_id:
    duration_slo: 5s

distributor:
  receivers:
    otlp:
      protocols:
        http:
          endpoint: "tempo:4318"
        grpc:
          endpoint: "tempo:4317"

metrics_generator:
  registry:
    external_labels:
      source: tempo
      cluster: docker-compose
  storage:
    path: /var/tempo/generator/wal
    remote_write:
      - url: http://prometheus:9090/api/v1/write
        send_exemplars: true

storage:
  trace:
    backend: local                     # backend configuration to use
    wal:
      path: /var/tempo/wal             # where to store the the wal locally
    local:
      path: /var/tempo/blocks

overrides:
  defaults:
    metrics_generator:
      processors: [service-graphs, span-metrics, local-blocks]
    compaction:
      block_retention: 1h
EOF
```

2.6 - Volvemos a desplegar el stack de monitorización y revisamos que todos los contenedores se levantan correctamente

```bash
docker compose -f docker-compose.obs.yml up --force-recreate -d
```

```bash
docker compose -f docker-compose.obs.yml ps -a
```

2.8 - En este punto accederemos a la interfaz de grafana con el Navegador (http://localhost:3000) y añadiremos los datasources `prometheus` y `tempo`. Recuerda añadir `Prometheus` como datasource de las métricas del `service graph` en la configuración de `Tempo`.

![alt text](./img/ds_prom_tempo.png)

Como podéis ver, `Tempo` está vacío, ya que aún no hemos instrumentado la aplicación. Por suerte, `OpenTelemetry` nos ofrece librerías para autoinstrumentalizar la aplicación sin tocar el código.

### Instrumentalización de la aplicación

2.9 - Consulta la documentación de OpenTelemetry sobre la autoinstrumentalización de nodejs (https://opentelemetry.io/docs/languages/js/automatic/) e instrumenta los 3 microservicios que forman la aplicación `kennels` -> `services/kennels | services/dogs | services/inventory`.

Reinicia el stack de aplicaciones con el siguiente comando, para recrear los contenedores y volver a construir las imágenes Docker.

```bash
docker compose up -d --force-recreate --build
```

<details><summary>Solución</summary>

```bash
# Install the Library Otel autoinstrumentation

cd ./services/dogs/ && npm install --save @opentelemetry/api  @opentelemetry/auto-instrumentations-node && rm -rf node_modules

cd ../inventory && npm install --save @opentelemetry/api  @opentelemetry/auto-instrumentations-node && rm -rf node_modules

cd ../kennels && npm install --save @opentelemetry/api  @opentelemetry/auto-instrumentations-node && rm -rf node_modules

# Add environment variables in docker-compose.yml to send the traces to the collector

# Modify the Package.json to use the auto-instrumentation library

sed -i 's/node src\/index.js/node --require @opentelemetry\/auto-instrumentations-node\/register src\/index.js/' ./services/dogs/package.json

sed -i 's/node src\/index.js/node --require @opentelemetry\/auto-instrumentations-node\/register src\/index.js/' ./services/inventory/package.json

sed -i 's/node src\/index.js/node --require @opentelemetry\/auto-instrumentations-node\/register src\/index.js/' ./services/kennels/package.json

# Add the following environment variables on each microservice container. Don't forget to replace the service name
environment:
- OTEL_SERVICE_NAME=<NAME_SERVICE>
- OTEL_TRACES_EXPORTER=otlp
- OTEL_EXPORTER_OTLP_ENDPOINT=alloy:4317
- OTEL_EXPORTER_OTLP_PROTOCOL=grpc
- OTEL_EXPORTER_OTLP_INSECURE=true

```

</details>

2.10 - Revisa que la instrumentación funciona correctamente y que se están generando las trazas. Para hacerlo consulta los logs de los contenedores de la aplicación y del collector donde deberías ver información sobre las trazas que va procesando.

```bash
# Generamos tráfico
curl http://localhost:8080/api/v1/kennels?id=1
curl http://localhost:8080/api/v1/kennels?id=2
curl http://localhost:8080/api/v1/kennels?id=3
```

2.11 - Accede a la interfaz de `Grafana` para ver el `service graph` de las trazas.

![alt text](img/sg.png)

2.12 - Oops... Parece que el microservicio dogs está fallando, ¿sabrías decir dónde? Consulta las trazas y haz una captura de pantalla de una traza de error.

> **ENTREGABLE**: Incluye la captura de pantalla en el repositorio

### Load testing

Como podéis ver, las trazas que estamos viendo son las que hemos generado nosotros de manera manual con `Curl`. Esto no es realista. En este punto definiremos una prueba sintética de carga con `Grafana K6`.

3.1 - Definiremos la prueba de carga. Esta es una propuesta, revisa la [documentación de K6](https://grafana.com/docs/k6/latest/testing-guides/test-types/stress-testing/) si quieres modificar el test.

```bash
cat << EOF > obs/load_test.js
import http from 'k6/http';
import { sleep } from 'k6';

const API_URL = 'http://nginx/api/v1/kennels';

export let options = {
  stages: [
    { duration: '1m', target: 50 }, // simulate ramp-up of traffic from 0 to 50 users over 1 minute
    { duration: '30m', target: 20 }, // stay at 20 users for 30 minutes
  ],
};

export default function () {
  let response = http.get(API_URL+'?id=0');
  let response2 = http.get(API_URL+'?id=1');
  let response3 = http.get(API_URL+'?id=2');
  sleep(1);
}
EOF
```
3.2 - A continuación, ejecutaremos la herramienta de K6 con Docker usando la prueba que hemos definido anteriormente.

```bash
docker run -it --rm -v $PWD/obs/load_test.js:/scripts/load_test.js --network kennels_net  grafana/k6:1.8.2 run /scripts/load_test.js
```

3.3 - Observa las trazas que se generan en Tempo. ¿Cuál es el ratio de fallos que nos estamos encontrando en el microservicio `dogs`? ¿Cuántas peticiones por segundo estamos generando con K6? ¿Cuál es el cuello de botella de la aplicación?


### Reto 1

Nos han encargado proporcionar un dashboard de grafana con las métricas propias del host utilizando [node_exporter](https://github.com/prometheus/node_exporter). Haz los cambios necesarios para desplegar node_exporter mediante docker-compose y despliega el dashboard [Node Exporter Full](https://grafana.com/grafana/dashboards/1860-node-exporter-full/) para visualizar las métricas.

> También podéis configurar alloy para ejecutar el binario integrado de node_exporter - [Ejemplo](https://grafana.com/docs/alloy/latest/reference/components/prometheus/prometheus.exporter.unix/#example)

- **ENTREGABLE**: Incluir un screenshot en el repositorio donde se vea el dashboard con datos


### Reto 2

También nos han pedido añadir una sonda para verificar que la aplicación funciona correctamente en todo momento. Para ello, deberás utilizar [blackbox-exporter](https://github.com/prometheus/blackbox_exporter) para monitorizar los siguientes enpoints:

- La aplicación local: `http://nginx/api/v1/kennels/health`.

- La web de UPCSchool: `https://upcschool.upc.edu`.

Finalmente, debéis desplegar un dashboard para visualizar el estado de las sondas en tiempo real. [Ver colección de Grafana](https://grafana.com/grafana/dashboards/?search=blackbox)

> Os recomendamos utilizar este dashboard para visualizar las métricas: https://grafana.com/grafana/dashboards/16124-blackbox-exporter/

- **ENTREGABLE**: Incluir un screenshot en el repositorio donde se vea el dashboard con datos

### Entrega

**No os olvidéis de subir todos los cambios a vuestro fork!**

> No hace falta incluir los dashboards / datasources. Solo los screenshots mencionados anteriormente

- Debéis dar acceso a @mcatrisse al proyecto para su evaluación
- Entregar via intranet `talent.upc.edu` un fichero .txt con la URL del proyecto (Github) y el número de grupo, siguiendo este formato:

  ```txt
  URL: <URL DE GITHUB>
  GRUPO: <Num de grupo>
  ```


### Cleanup

Eliminaremos los recursos generados con Docker.

```bash
docker compose down -v && docker compose -f docker-compose.obs.yml down -v
docker network rm kennels_net
```
