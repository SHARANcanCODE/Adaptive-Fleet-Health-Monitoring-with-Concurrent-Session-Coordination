#include "config.hpp"
#include "http_client.hpp"
#include "local_analytics.hpp"
#include <chrono>
#include <cmath>
#include <ctime>
#include <iomanip>
#include <iostream>
#include <random>
#include <sstream>
#include <thread>

// Get current timestamp in ISO 8601 format
std::string getCurrentTimestamp() {
  auto now = std::chrono::system_clock::now();
  auto time_t = std::chrono::system_clock::to_time_t(now);
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                now.time_since_epoch()) %
            1000;

  std::ostringstream oss;
  oss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%S");
  oss << "." << std::setfill('0') << std::setw(3) << ms.count() << "Z";
  return oss.str();
}

// Generate simulated metrics
MetricPoint generateMetrics(double t, double anomaly_prob, std::mt19937 &gen,
                            std::normal_distribution<> &normal_dist) {
  MetricPoint point;
  point.ts = getCurrentTimestamp();

  // Base values with sinusoidal variation
  double temp_base = 22.0 + 3.0 * std::sin(t / 60.0); // ~1 minute cycle
  double vib_base = 0.02;
  double hum_base = 45.0;
  double volt_base = 4.9;

  // Add noise
  double temp_noise = normal_dist(gen) * 0.2;
  double vib_noise = std::abs(normal_dist(gen) * 0.01);
  double hum_noise = normal_dist(gen) * 0.5;
  double volt_noise = normal_dist(gen) * 0.01;

  // Occasionally inject anomalies
  std::uniform_real_distribution<> anomaly_dist(0.0, 1.0);
  bool inject_anomaly = anomaly_dist(gen) < anomaly_prob;

  if (inject_anomaly) {
    // Temperature spike
    if (anomaly_dist(gen) < 0.5) {
      temp_noise += 8.0; // +8C spike
      std::cout << "[ANOMALY] Temperature spike detected!" << std::endl;
    } else {
      // Vibration spike
      vib_noise += 0.5; // Large vibration spike
      std::cout << "[ANOMALY] Vibration spike detected!" << std::endl;
    }
  }

  point.temperature_c = temp_base + temp_noise;
  point.vibration_g = vib_base + vib_noise;
  point.humidity_pct = hum_base + hum_noise;
  point.voltage_v = volt_base + volt_noise;

  return point;
}

int main(int argc, char *argv[]) {
  std::cout << "IoT Edge Agent - Starting..." << std::endl;

  // Load configuration
  AgentConfig config;

  // Try to load from file first (relative to executable or current directory)
  std::string config_path = "config/agent.json";
  // Also try parent directory if running from build/
  if (!config.loadFromFile(config_path)) {
    config.loadFromFile("../config/agent.json");
  }

  // Override with environment variables
  config.loadFromEnv();

  // Override with command line arguments
  config.parseArgs(argc, argv);

  std::cout << "Configuration:" << std::endl;
  std::cout << "  Device ID: " << config.device_id << std::endl;
  std::cout << "  API URL: " << config.api_base_url << std::endl;
  std::cout << "  Interval: " << config.interval_ms << " ms" << std::endl;
  std::cout << "  Anomaly Probability: " << config.anomaly_probability
            << std::endl;

  // Initialize HTTP client
  HttpClient client(config.api_base_url);

  // Initialize local analytics for edge-side anomaly detection
  LocalAnalytics local_analytics(200, 3.0);
  std::cout << "  Local Analytics: Enabled (window=200, z-threshold=3.0)"
            << std::endl;

  // Random number generator
  std::random_device rd;
  std::mt19937 gen(rd());
  std::normal_distribution<> normal_dist(0.0, 1.0);
  std::uniform_int_distribution<> jitter_dist(-config.jitter_ms,
                                              config.jitter_ms);

  // Time tracking
  auto start_time = std::chrono::steady_clock::now();
  double t = 0.0;

  // Retry configuration
  const int max_retries = 3;
  const int retry_delay_ms = 1000;

  std::cout << "Starting metric collection loop..." << std::endl;

  while (true) {
    try {
      // Generate metrics
      MetricPoint point =
          generateMetrics(t, config.anomaly_probability, gen, normal_dist);

      // Update local analytics for each metric
      bool temp_anomaly =
          local_analytics.updateMetric("temperature", point.temperature_c);
      bool vib_anomaly =
          local_analytics.updateMetric("vibration", point.vibration_g);
      bool hum_anomaly =
          local_analytics.updateMetric("humidity", point.humidity_pct);
      bool volt_anomaly =
          local_analytics.updateMetric("voltage", point.voltage_v);

      // Get z-scores
      double temp_z =
          local_analytics.getZScore("temperature", point.temperature_c);
      double vib_z = local_analytics.getZScore("vibration", point.vibration_g);

      // Print metrics with local analytics
      std::cout << "[" << point.ts << "] "
                << "Temp: " << std::fixed << std::setprecision(2)
                << point.temperature_c << "°C"
                << " (z=" << std::setprecision(2) << temp_z << "), "
                << "Vib: " << point.vibration_g << "g"
                << " (z=" << std::setprecision(2) << vib_z << "), "
                << "Hum: " << point.humidity_pct << "%, "
                << "Volt: " << point.voltage_v << "V";

      // Show local anomaly detection
      if (temp_anomaly || vib_anomaly || hum_anomaly || volt_anomaly) {
        std::cout << " [LOCAL ANOMALY";
        if (temp_anomaly)
          std::cout << " TEMP";
        if (vib_anomaly)
          std::cout << " VIB";
        if (hum_anomaly)
          std::cout << " HUM";
        if (volt_anomaly)
          std::cout << " VOLT";
        std::cout << "]";
      }
      std::cout << std::endl;

      // Send metrics asynchronously (non-blocking)
      std::vector<MetricPoint> metrics = {point};
      client.postMetricsAsync(config.device_id, metrics);

      // Periodically check for background errors
      std::string last_http_error = client.getLastError();
      if (!last_http_error.empty()) {
        std::cerr << "Background HTTP Error: " << last_http_error << std::endl;
      }

      // Calculate sleep time with jitter
      int sleep_ms = config.interval_ms + jitter_dist(gen);
      sleep_ms = std::max(100, sleep_ms); // Minimum 100ms

      std::this_thread::sleep_for(std::chrono::milliseconds(sleep_ms));

      // Update time
      auto current_time = std::chrono::steady_clock::now();
      auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                         current_time - start_time)
                         .count();
      t = elapsed / 1000.0; // Convert to seconds

    } catch (const std::exception &e) {
      std::cerr << "Exception: " << e.what() << std::endl;
      std::this_thread::sleep_for(
          std::chrono::milliseconds(config.interval_ms));
    }
  }

  return 0;
}
