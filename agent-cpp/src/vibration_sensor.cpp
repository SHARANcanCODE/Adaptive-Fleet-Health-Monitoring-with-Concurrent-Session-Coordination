#include "config.hpp"
#include "http_client.hpp"
#include "fft_analyzer.hpp"
#include "local_analytics.hpp"
#include <iostream>
#include <chrono>
#include <thread>
#include <random>
#include <cmath>
#include <ctime>
#include <iomanip>
#include <sstream>

// Get current timestamp in ISO 8601 format
std::string getCurrentTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;

    std::ostringstream oss;
    oss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%S");
    oss << "." << std::setfill('0') << std::setw(3) << ms.count() << "Z";
    return oss.str();
}

// Generate vibration signal with frequency components
double generateVibrationSignal(double t, std::mt19937& gen, std::normal_distribution<>& normal_dist) {
    // Base vibration from rotating machinery (e.g., 30 Hz motor)
    double base_freq = 30.0; // Hz
    double base_amplitude = 0.02; // g
    
    // Normal vibration signal
    double vibration = base_amplitude * std::sin(2.0 * M_PI * base_freq * t);
    
    // Add harmonics (2nd and 3rd)
    vibration += 0.005 * std::sin(2.0 * M_PI * base_freq * 2.0 * t);
    vibration += 0.002 * std::sin(2.0 * M_PI * base_freq * 3.0 * t);
    
    // Add noise
    vibration += std::abs(normal_dist(gen) * 0.01);
    
    // Occasionally inject anomalies
    std::uniform_real_distribution<> anomaly_dist(0.0, 1.0);
    bool inject_anomaly = anomaly_dist(gen) < 0.05; // 5% probability
    
    if (inject_anomaly) {
        // High-frequency resonance (bearing failure simulation)
        if (anomaly_dist(gen) < 0.5) {
            vibration += 0.3 * std::sin(2.0 * M_PI * 150.0 * t); // 150 Hz resonance
            std::cout << "[FFT ANOMALY] High-frequency resonance detected!" << std::endl;
        } else {
            // Amplitude spike (imbalance)
            vibration += 0.5;
            std::cout << "[FFT ANOMALY] Vibration amplitude spike detected!" << std::endl;
        }
    }
    
    return std::abs(vibration); // Vibration is always positive magnitude
}

int main(int argc, char* argv[]) {
    std::cout << "IoT Vibration Sensor Module - Starting..." << std::endl;
    std::cout << "Features: FFT-based anomaly detection + Local analytics" << std::endl;

    // Load configuration
    AgentConfig config;
    
    // Try to load from file first
    std::string config_path = "config/agent.json";
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

    // Initialize HTTP client
    HttpClient client(config.api_base_url);

    // Initialize FFT analyzer (1000 Hz sample rate)
    FFTAnalyzer fft_analyzer(256, 1000.0);
    
    // Initialize local analytics
    LocalAnalytics local_analytics(200, 3.0);

    // Random number generator
    std::random_device rd;
    std::mt19937 gen(rd());
    std::normal_distribution<> normal_dist(0.0, 1.0);
    std::uniform_int_distribution<> jitter_dist(-config.jitter_ms, config.jitter_ms);

    // Time tracking
    auto start_time = std::chrono::steady_clock::now();
    double t = 0.0;

    // Retry configuration
    const int max_retries = 3;
    const int retry_delay_ms = 1000;

    std::cout << "Starting vibration monitoring loop..." << std::endl;
    std::cout << "FFT window: 256 samples, Local analytics window: 200 samples" << std::endl;

    while (true) {
        try {
            // Generate vibration signal
            double vibration = generateVibrationSignal(t, gen, normal_dist);

            // Add to FFT analyzer
            bool fft_anomaly = fft_analyzer.addSample(vibration);

            // Update local analytics
            bool local_anomaly = local_analytics.updateMetric("vibration", vibration);
            
            // Get z-score from local analytics
            double z_score = local_analytics.getZScore("vibration", vibration);
            auto stats = local_analytics.getStats("vibration");

            // Print metrics with analytics
            std::cout << "[" << getCurrentTimestamp() << "] "
                      << "Vib: " << std::fixed << std::setprecision(4) << vibration << "g, "
                      << "Z-score: " << std::setprecision(2) << z_score << ", "
                      << "Mean: " << stats.mean << ", "
                      << "StdDev: " << stats.stddev;

            // Anomaly flags
            if (fft_anomaly || local_anomaly) {
                std::cout << " [ANOMALY";
                if (fft_anomaly) std::cout << " FFT";
                if (local_anomaly) std::cout << " LOCAL";
                std::cout << "]";
            }
            std::cout << std::endl;

            // Perform FFT analysis periodically (every 256 samples)
            if (fft_analyzer.getSamples().size() >= 256) {
                auto fd = fft_analyzer.analyze();
                std::cout << "  [FFT] Dominant freq: " << std::fixed << std::setprecision(2) 
                          << fd.dominant_freq << " Hz, "
                          << "Total power: " << fd.total_power << std::endl;
            }

            // Create metric point (vibration sensor only sends vibration)
            MetricPoint point;
            point.ts = getCurrentTimestamp();
            point.temperature_c = 0.0; // Not measured by vibration sensor
            point.vibration_g = vibration;
            point.humidity_pct = 0.0; // Not measured
            point.voltage_v = 0.0; // Not measured

            // Add anomaly flags to metric (could be sent as metadata)
            // For now, we'll send the metric and let backend detect anomalies too

            // Send metrics with retry logic
            std::vector<MetricPoint> metrics = {point};
            bool success = false;

            for (int retry = 0; retry < max_retries; retry++) {
                if (client.postMetrics(config.device_id, metrics)) {
                    success = true;
                    break;
                }

                if (retry < max_retries - 1) {
                    std::cerr << "Warning: Failed to send metrics (attempt " << (retry + 1) << "/" << max_retries << "): "
                              << client.getLastError() << std::endl;
                    std::this_thread::sleep_for(std::chrono::milliseconds(retry_delay_ms * (retry + 1)));
                }
            }

            if (!success) {
                std::cerr << "Error: Failed to send metrics after " << max_retries << " attempts: "
                          << client.getLastError() << std::endl;
            }

            // Calculate sleep time with jitter
            int sleep_ms = config.interval_ms + jitter_dist(gen);
            sleep_ms = std::max(100, sleep_ms); // Minimum 100ms

            std::this_thread::sleep_for(std::chrono::milliseconds(sleep_ms));

            // Update time
            auto current_time = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                current_time - start_time).count();
            t = elapsed / 1000.0; // Convert to seconds

        } catch (const std::exception& e) {
            std::cerr << "Exception: " << e.what() << std::endl;
            std::this_thread::sleep_for(std::chrono::milliseconds(config.interval_ms));
        }
    }

    return 0;
}

