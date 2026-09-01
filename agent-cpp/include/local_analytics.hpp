#ifndef LOCAL_ANALYTICS_HPP
#define LOCAL_ANALYTICS_HPP

#include <vector>
#include <deque>
#include <map>
#include <string>
#include <cmath>
#include <algorithm>
#include <numeric>

/**
 * Local analytics module for edge-side anomaly detection
 * Implements running mean and z-score calculation for lightweight anomaly detection
 */
class LocalAnalytics {
public:
    struct Stats {
        double mean;
        double stddev;
        size_t count;
    };

    LocalAnalytics(size_t window_size = 200, double z_threshold = 3.0)
        : window_size_(window_size), z_threshold_(z_threshold) {}

    /**
     * Update statistics for a metric value
     * Returns true if anomaly detected (z-score > threshold)
     */
    bool updateMetric(const std::string& metric_name, double value) {
        auto& window = windows_[metric_name];
        auto& stats = statistics_[metric_name];

        // Add new value to window
        window.push_back(value);
        if (window.size() > window_size_) {
            window.pop_front();
        }

        // Recalculate statistics
        updateStats(metric_name, window, stats);

        // Check for anomaly
        if (stats.count >= 10) { // Need at least 10 samples for meaningful z-score
            double z_score = std::abs((value - stats.mean) / stats.stddev);
            return z_score > z_threshold_;
        }

        return false;
    }

    /**
     * Get current statistics for a metric
     */
    Stats getStats(const std::string& metric_name) const {
        auto it = statistics_.find(metric_name);
        if (it != statistics_.end()) {
            return it->second;
        }
        return {0.0, 0.0, 0};
    }

    /**
     * Get z-score for a value without updating statistics
     */
    double getZScore(const std::string& metric_name, double value) const {
        auto it = statistics_.find(metric_name);
        if (it != statistics_.end() && it->second.count >= 10) {
            const auto& stats = it->second;
            if (stats.stddev > 0.0) {
                return std::abs((value - stats.mean) / stats.stddev);
            }
        }
        return 0.0;
    }

    /**
     * Reset statistics for a metric
     */
    void reset(const std::string& metric_name) {
        windows_.erase(metric_name);
        statistics_.erase(metric_name);
    }

    /**
     * Reset all statistics
     */
    void resetAll() {
        windows_.clear();
        statistics_.clear();
    }

private:
    void updateStats(const std::string& metric_name, 
                    const std::deque<double>& window,
                    Stats& stats) {
        if (window.empty()) {
            stats = {0.0, 0.0, 0};
            return;
        }

        stats.count = window.size();

        // Calculate mean
        double sum = std::accumulate(window.begin(), window.end(), 0.0);
        stats.mean = sum / stats.count;

        // Calculate standard deviation
        if (stats.count > 1) {
            double variance = 0.0;
            for (double val : window) {
                double diff = val - stats.mean;
                variance += diff * diff;
            }
            stats.stddev = std::sqrt(variance / (stats.count - 1));
        } else {
            stats.stddev = 0.0;
        }
    }

    size_t window_size_;
    double z_threshold_;
    std::map<std::string, std::deque<double>> windows_;
    std::map<std::string, Stats> statistics_;
};

#endif // LOCAL_ANALYTICS_HPP

