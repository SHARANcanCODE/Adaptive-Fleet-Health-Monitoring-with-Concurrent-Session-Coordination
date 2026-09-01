#ifndef MQTT_CLIENT_H
#define MQTT_CLIENT_H

#include <mosquitto.h>
#include <stdbool.h>

typedef struct {
    char device_id[128];
    char broker_url[256];
    char topic[256];
    int interval_ms;
    double spike_prob;
    bool connected;
    struct mosquitto *mosq;
} mqtt_config_t;

/**
 * Initialize MQTT client
 * Returns 0 on success, -1 on error
 */
int mqtt_client_init(mqtt_config_t *config);

/**
 * Connect to MQTT broker
 * Returns 0 on success, -1 on error
 */
int mqtt_client_connect(mqtt_config_t *config);

/**
 * Publish a JSON metric payload
 * Returns 0 on success, -1 on error
 */
int mqtt_client_publish_metric(mqtt_config_t *config, const char *json_payload);

/**
 * Disconnect and cleanup
 */
void mqtt_client_cleanup(mqtt_config_t *config);

/**
 * Check if connected
 */
bool mqtt_client_is_connected(mqtt_config_t *config);

#endif // MQTT_CLIENT_H

