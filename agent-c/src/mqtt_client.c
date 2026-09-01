#include "mqtt_client.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <errno.h>

static void on_connect(struct mosquitto *mosq, void *obj, int rc) {
    mqtt_config_t *config = (mqtt_config_t *)obj;
    if (rc == 0) {
        config->connected = true;
        printf("[MQTT] Connected to broker\n");
    } else {
        config->connected = false;
        fprintf(stderr, "[MQTT] Connection failed: %s\n", mosquitto_connack_string(rc));
    }
}

static void on_disconnect(struct mosquitto *mosq, void *obj, int rc) {
    mqtt_config_t *config = (mqtt_config_t *)obj;
    config->connected = false;
    if (rc != 0) {
        printf("[MQTT] Unexpected disconnect, reconnecting...\n");
    } else {
        printf("[MQTT] Disconnected\n");
    }
}

static void on_publish(struct mosquitto *mosq, void *obj, int mid) {
    // Message published successfully
}

int mqtt_client_init(mqtt_config_t *config) {
    mosquitto_lib_init();
    
    config->mosq = mosquitto_new(config->device_id, true, config);
    if (!config->mosq) {
        fprintf(stderr, "[MQTT] Failed to create client\n");
        return -1;
    }
    
    mosquitto_connect_callback_set(config->mosq, on_connect);
    mosquitto_disconnect_callback_set(config->mosq, on_disconnect);
    mosquitto_publish_callback_set(config->mosq, on_publish);
    
    config->connected = false;
    return 0;
}

int mqtt_client_connect(mqtt_config_t *config) {
    // Parse broker URL (format: mqtt://host:port or mqtt://host)
    char host[256] = {0};
    int port = 1883;
    
    if (strncmp(config->broker_url, "mqtt://", 7) == 0) {
        char *url = config->broker_url + 7;
        char *port_str = strchr(url, ':');
        if (port_str) {
            *port_str = '\0';
            strncpy(host, url, sizeof(host) - 1);
            port = atoi(port_str + 1);
        } else {
            strncpy(host, url, sizeof(host) - 1);
        }
    } else {
        strncpy(host, config->broker_url, sizeof(host) - 1);
    }
    
    printf("[MQTT] Connecting to %s:%d...\n", host, port);
    
    int rc = mosquitto_connect(config->mosq, host, port, 60);
    if (rc != MOSQ_ERR_SUCCESS) {
        fprintf(stderr, "[MQTT] Connect error: %s\n", mosquitto_strerror(rc));
        return -1;
    }
    
    // Start network loop
    mosquitto_loop_start(config->mosq);
    
    // Wait for connection (with timeout)
    int attempts = 0;
    while (!config->connected && attempts < 50) {
        usleep(100000); // 100ms
        attempts++;
    }
    
    if (!config->connected) {
        fprintf(stderr, "[MQTT] Connection timeout\n");
        return -1;
    }
    
    return 0;
}

int mqtt_client_publish_metric(mqtt_config_t *config, const char *json_payload) {
    if (!config->connected) {
        fprintf(stderr, "[MQTT] Not connected, attempting reconnect...\n");
        if (mqtt_client_connect(config) != 0) {
            return -1;
        }
    }
    
    int rc = mosquitto_publish(config->mosq, NULL, config->topic, 
                               strlen(json_payload), json_payload, 0, false);
    if (rc != MOSQ_ERR_SUCCESS) {
        fprintf(stderr, "[MQTT] Publish error: %s\n", mosquitto_strerror(rc));
        if (rc == MOSQ_ERR_NO_CONN) {
            config->connected = false;
        }
        return -1;
    }
    
    return 0;
}

bool mqtt_client_is_connected(mqtt_config_t *config) {
    return config->connected;
}

void mqtt_client_cleanup(mqtt_config_t *config) {
    if (config->mosq) {
        mosquitto_disconnect(config->mosq);
        mosquitto_loop_stop(config->mosq, false);
        mosquitto_destroy(config->mosq);
        config->mosq = NULL;
    }
    mosquitto_lib_cleanup();
    config->connected = false;
}

