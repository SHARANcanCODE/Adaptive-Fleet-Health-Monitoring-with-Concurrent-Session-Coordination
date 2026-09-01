#include "mqtt_client.h"
#include <math.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define MAX_LINE 1024
#define DEFAULT_DEVICE_ID "device-c-001"
#define DEFAULT_BROKER "mqtt://localhost:1883"
#define DEFAULT_TOPIC_PREFIX "sensors"
#define DEFAULT_INTERVAL_MS 1000
#define DEFAULT_SPIKE_PROB 0.01

static volatile bool running = true;

void signal_handler(int sig) {
  (void)sig;
  running = false;
}

/**
 * Parse INI-style config file (simple key=value parser)
 */
int parse_config(const char *filename, mqtt_config_t *config) {
  FILE *fp = fopen(filename, "r");
  if (!fp) {
    return -1;
  }

  char line[MAX_LINE];
  while (fgets(line, sizeof(line), fp)) {
    // Skip comments and empty lines
    if (line[0] == '#' || line[0] == '\n' || line[0] == '\r') {
      continue;
    }

    // Remove trailing newline
    line[strcspn(line, "\n\r")] = '\0';

    char *eq = strchr(line, '=');
    if (!eq)
      continue;

    *eq = '\0';
    char *key = line;
    char *value = eq + 1;

    // Trim whitespace
    while (*key == ' ' || *key == '\t')
      key++;
    while (*value == ' ' || *value == '\t')
      value++;

    if (strcmp(key, "device_id") == 0) {
      strncpy(config->device_id, value, sizeof(config->device_id) - 1);
    } else if (strcmp(key, "mqtt_broker_url") == 0) {
      strncpy(config->broker_url, value, sizeof(config->broker_url) - 1);
    } else if (strcmp(key, "topic") == 0) {
      strncpy(config->topic, value, sizeof(config->topic) - 1);
    } else if (strcmp(key, "interval_ms") == 0) {
      config->interval_ms = atoi(value);
    } else if (strcmp(key, "anomaly_spike_prob") == 0) {
      config->spike_prob = atof(value);
    }
  }

  fclose(fp);
  return 0;
}

/**
 * Generate a random double in [0, 1)
 */
double random_double() { return (double)rand() / (double)RAND_MAX; }

/**
 * Generate normal distribution using Box-Muller transform
 */
double normal_random(double mean, double stddev) {
  double u1 = random_double();
  double u2 = random_double();
  double z = sqrt(-2.0 * log(u1)) * cos(2.0 * M_PI * u2);
  return mean + stddev * z;
}

/**
 * Generate metric values with noise and occasional spikes
 */
void generate_metrics(double *temp, double *vib, double *hum, double *volt,
                      double spike_prob, time_t t) {
  // Base values with sinusoidal variation
  double base_temp = 22.0 + 2.0 * sin(t / 60.0);
  double base_vib = 0.02;
  double base_hum = 45.0;
  double base_volt = 4.9;

  // Add noise
  *temp = base_temp + normal_random(0, 0.2);
  *vib = fabs(base_vib + normal_random(0, 0.01));
  *hum = base_hum + normal_random(0, 0.5);
  *volt = base_volt + normal_random(0, 0.01);

  // Inject spike with probability
  if (random_double() < spike_prob) {
    if (random_double() < 0.5) {
      *temp += 8.0; // Temperature spike
    } else {
      *vib += 0.5; // Vibration spike
    }
  }
}

/**
 * Format ISO8601 timestamp
 */
void format_iso8601(char *buf, size_t len, time_t t) {
  struct tm *tm_info = gmtime(&t);
  strftime(buf, len, "%Y-%m-%dT%H:%M:%S.000Z", tm_info);
}

int main(int argc, char *argv[]) {
  mqtt_config_t config = {0};

  // Defaults
  strcpy(config.device_id, DEFAULT_DEVICE_ID);
  strcpy(config.broker_url, DEFAULT_BROKER);
  snprintf(config.topic, sizeof(config.topic), "%s/%s/metrics",
           DEFAULT_TOPIC_PREFIX, config.device_id);
  config.interval_ms = DEFAULT_INTERVAL_MS;
  config.spike_prob = DEFAULT_SPIKE_PROB;

  // Parse config file if exists
  parse_config("config/agent.ini", &config);

  // Override with CLI args
  for (int i = 1; i < argc; i++) {
    if (strncmp(argv[i], "--device_id=", 12) == 0) {
      strncpy(config.device_id, argv[i] + 12, sizeof(config.device_id) - 1);
      snprintf(config.topic, sizeof(config.topic), "%s/%s/metrics",
               DEFAULT_TOPIC_PREFIX, config.device_id);
    } else if (strncmp(argv[i], "--mqtt=", 7) == 0) {
      strncpy(config.broker_url, argv[i] + 7, sizeof(config.broker_url) - 1);
    } else if (strncmp(argv[i], "--interval_ms=", 14) == 0) {
      config.interval_ms = atoi(argv[i] + 14);
    } else if (strncmp(argv[i], "--spike_prob=", 13) == 0) {
      config.spike_prob = atof(argv[i] + 13);
    }
  }

  printf("=== C MQTT Sensor Agent ===\n");
  printf("Device ID: %s\n", config.device_id);
  printf("Broker: %s\n", config.broker_url);
  printf("Topic: %s\n", config.topic);
  printf("Interval: %d ms\n", config.interval_ms);
  printf("Spike probability: %.2f%%\n", config.spike_prob * 100.0);
  printf("\n");

  // Initialize MQTT client
  if (mqtt_client_init(&config) != 0) {
    fprintf(stderr, "Failed to initialize MQTT client\n");
    return 1;
  }

  // Connect
  if (mqtt_client_connect(&config) != 0) {
    fprintf(stderr, "Failed to connect to MQTT broker\n");
    mqtt_client_cleanup(&config);
    return 1;
  }

  // Setup signal handlers
  signal(SIGINT, signal_handler);
  signal(SIGTERM, signal_handler);

  // Seed random
  srand(time(NULL));

  time_t last_reconnect_attempt = 0;
  int reconnect_delay = 1; // Start with 1s

  while (running) {
    time_t now = time(NULL);
    double temp, vib, hum, volt;

    generate_metrics(&temp, &vib, &hum, &volt, config.spike_prob,
                     now - start_time);

    // Format JSON payload
    char timestamp[64];
    format_iso8601(timestamp, sizeof(timestamp), now);

    char json[512];
    int json_len =
        snprintf(json, sizeof(json),
                 "{\"ts\":\"%s\",\"temperature_c\":%.2f,\"vibration_g\":%.4f,"
                 "\"humidity_pct\":%.2f,\"voltage_v\":%.2f}",
                 timestamp, temp, vib, hum, volt);

    if (json_len < 0 || json_len >= sizeof(json)) {
      fprintf(stderr, "Payload too large or format error\n");
    } else if (mqtt_client_is_connected(&config)) {
      // Publish only if connected
      if (mqtt_client_publish_metric(&config, json) == 0) {
        message_count++;
        printf("[%d] Published: temp=%.2f°C, vib=%.4fg\n", message_count, temp,
               vib);
        reconnect_delay = 1; // Reset backoff on success
      } else {
        fprintf(stderr, "Failed to publish message\n");
      }
    }

    // Non-blocking sleep/check for reconnection
    usleep(config.interval_ms * 1000);

    // Reconnect logic with backoff
    if (!mqtt_client_is_connected(&config)) {
      if (now - last_reconnect_attempt >= reconnect_delay) {
        printf("Reconnecting (next attempt in %ds)...\n", reconnect_delay);
        if (mqtt_client_connect(&config) == 0) {
          reconnect_delay = 1; // Reset
        } else {
          // Exponential backoff
          reconnect_delay =
              (reconnect_delay * 2 > 30) ? 30 : reconnect_delay * 2;
        }
        last_reconnect_attempt = time(NULL);
      }
    }
  }

  printf("\nShutting down...\n");
  mqtt_client_cleanup(&config);
  printf("Published %d messages total\n", message_count);

  return 0;
}
