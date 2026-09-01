#include "config.hpp"
#include <fstream>
#include <iostream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <algorithm>

// Simple JSON parser (minimal implementation)
namespace {
    std::string trim(const std::string& str) {
        size_t first = str.find_first_not_of(" \t\n\r");
        if (first == std::string::npos) return "";
        size_t last = str.find_last_not_of(" \t\n\r");
        return str.substr(first, (last - first + 1));
    }

    std::string getJsonValue(const std::string& json, const std::string& key) {
        std::string searchKey = "\"" + key + "\"";
        size_t pos = json.find(searchKey);
        if (pos == std::string::npos) return "";

        pos = json.find(":", pos);
        if (pos == std::string::npos) return "";

        size_t start = json.find_first_not_of(" \t:", pos);
        if (start == std::string::npos) return "";

        size_t end = start;
        if (json[start] == '"') {
            start++;
            end = json.find("\"", start);
            if (end == std::string::npos) return "";
            return json.substr(start, end - start);
        } else {
            while (end < json.length() && json[end] != ',' && json[end] != '}' && json[end] != '\n') {
                end++;
            }
            return trim(json.substr(start, end - start));
        }
    }

    bool getJsonBool(const std::string& json, const std::string& key) {
        std::string value = getJsonValue(json, key);
        return value == "true" || value == "1";
    }
}

AgentConfig::AgentConfig()
    : device_id("sim-device-001")
    , api_base_url("http://your-backend-url:8080")
    , interval_ms(1000)
    , jitter_ms(100)
    , anomaly_probability(0.05)
{
    metrics_enabled["temperature"] = true;
    metrics_enabled["vibration"] = true;
    metrics_enabled["humidity"] = true;
    metrics_enabled["voltage"] = true;
}

bool AgentConfig::loadFromFile(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        std::cerr << "Warning: Could not open config file: " << filepath << std::endl;
        return false;
    }

    std::string json((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    file.close();

    // Parse JSON (simple implementation)
    std::string value;

    value = getJsonValue(json, "device_id");
    if (!value.empty()) device_id = value;

    value = getJsonValue(json, "api_base_url");
    if (!value.empty()) api_base_url = value;

    value = getJsonValue(json, "interval_ms");
    if (!value.empty()) interval_ms = std::stoi(value);

    value = getJsonValue(json, "jitter_ms");
    if (!value.empty()) jitter_ms = std::stoi(value);

    value = getJsonValue(json, "anomaly_probability");
    if (!value.empty()) anomaly_probability = std::stod(value);

    // Parse metrics object
    size_t metricsPos = json.find("\"metrics\"");
    if (metricsPos != std::string::npos) {
        metrics_enabled["temperature"] = getJsonBool(json, "temperature");
        metrics_enabled["vibration"] = getJsonBool(json, "vibration");
        metrics_enabled["humidity"] = getJsonBool(json, "humidity");
        metrics_enabled["voltage"] = getJsonBool(json, "voltage");
    }

    return true;
}

void AgentConfig::loadFromEnv() {
    const char* env;

    env = std::getenv("AGENT_DEVICE_ID");
    if (env) device_id = env;

    env = std::getenv("AGENT_API_BASE_URL");
    if (env) api_base_url = env;

    env = std::getenv("AGENT_INTERVAL_MS");
    if (env) interval_ms = std::stoi(env);

    env = std::getenv("AGENT_ANOMALY_PROBABILITY");
    if (env) anomaly_probability = std::stod(env);
}

void AgentConfig::parseArgs(int argc, char* argv[]) {
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg.find("--device_id=") == 0) {
            device_id = arg.substr(13);
        } else if (arg.find("--api_base_url=") == 0) {
            api_base_url = arg.substr(16);
        } else if (arg.find("--interval_ms=") == 0) {
            interval_ms = std::stoi(arg.substr(15));
        } else if (arg.find("--anomaly_probability=") == 0) {
            anomaly_probability = std::stod(arg.substr(22));
        } else if (arg == "--help" || arg == "-h") {
            std::cout << "Usage: " << argv[0] << " [options]\n"
                      << "Options:\n"
                      << "  --device_id=ID           Device identifier\n"
                      << "  --api_base_url=URL       Backend API URL\n"
                      << "  --interval_ms=MS         Collection interval in milliseconds\n"
                      << "  --anomaly_probability=P  Probability of injecting anomalies (0.0-1.0)\n"
                      << "  --help, -h               Show this help\n";
            exit(0);
        }
    }
}

