#ifndef CONFIG_HPP
#define CONFIG_HPP

#include <string>
#include <map>

struct AgentConfig {
    std::string device_id;
    std::string api_base_url;
    int interval_ms;
    int jitter_ms;
    double anomaly_probability;
    std::map<std::string, bool> metrics_enabled;

    // Default constructor
    AgentConfig();

    // Load from JSON file
    bool loadFromFile(const std::string& filepath);

    // Load from environment variables
    void loadFromEnv();

    // Override with command line arguments
    void parseArgs(int argc, char* argv[]);
};

#endif // CONFIG_HPP

