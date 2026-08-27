# ---- build ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Dependencies resolve in their own layer, so a source-only change does not re-download them.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q -DskipTests package

# ---- run ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/classflow-api-0.1.0.jar app.jar

# Tuned for a 512MB instance. SerialGC because the parallel collectors reserve per-thread
# structures this workload never benefits from, and a capped heap leaves room for the JVM's
# own non-heap memory, which is what actually gets a container killed.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k -XX:MaxMetaspaceSize=128m"

# Hosts inject PORT; application.yml reads SERVER_PORT. Mapping them here avoids binding a
# port nothing routes to, which fails as a silent timeout rather than an error.
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT:-8080}"]
