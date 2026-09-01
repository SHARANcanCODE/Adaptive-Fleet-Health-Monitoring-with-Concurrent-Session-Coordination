#ifndef FFT_ANALYZER_HPP
#define FFT_ANALYZER_HPP

#include <vector>
#include <complex>
#include <cmath>
#include <algorithm>
#include <numeric>

/**
 * Lightweight FFT-based frequency domain analyzer for vibration data
 * Implements Cooley-Tukey FFT algorithm for anomaly detection
 */
class FFTAnalyzer {
public:
    struct FrequencyDomain {
        std::vector<double> magnitudes;
        std::vector<double> frequencies;
        double dominant_freq;
        double total_power;
    };

    FFTAnalyzer(size_t window_size = 256, double sample_rate = 1000.0)
        : window_size_(window_size), sample_rate_(sample_rate) {}

    /**
     * Add a vibration sample and return anomaly flag
     * Returns true if anomaly detected based on frequency domain analysis
     */
    bool addSample(double vibration_value) {
        samples_.push_back(vibration_value);
        
        if (samples_.size() > window_size_) {
            samples_.erase(samples_.begin());
        }

        // Need enough samples for meaningful FFT
        if (samples_.size() >= window_size_) {
            return analyzeFrequencyDomain();
        }

        return false;
    }

    /**
     * Perform FFT and analyze frequency domain
     */
    FrequencyDomain analyze() {
        FrequencyDomain result;
        
        if (samples_.size() < 2) {
            return result;
        }

        // Perform FFT
        std::vector<std::complex<double>> fft_result = fft(samples_);
        
        // Calculate magnitudes and frequencies
        result.magnitudes.resize(fft_result.size() / 2);
        result.frequencies.resize(fft_result.size() / 2);
        
        double max_magnitude = 0.0;
        size_t max_index = 0;
        result.total_power = 0.0;

        for (size_t i = 0; i < result.magnitudes.size(); ++i) {
            double magnitude = std::abs(fft_result[i]);
            result.magnitudes[i] = magnitude;
            result.frequencies[i] = (i * sample_rate_) / samples_.size();
            result.total_power += magnitude * magnitude;

            if (magnitude > max_magnitude) {
                max_magnitude = magnitude;
                max_index = i;
            }
        }

        result.dominant_freq = result.frequencies[max_index];
        return result;
    }

    /**
     * Get current samples
     */
    const std::vector<double>& getSamples() const {
        return samples_;
    }

    /**
     * Reset analyzer
     */
    void reset() {
        samples_.clear();
    }

private:
    /**
     * Iterative Radix-2 Cooley-Tukey FFT implementation
     * Avoids recursion and minimizes allocations for edge performance.
     */
    std::vector<std::complex<double>> fft(const std::vector<double>& input) {
        size_t n = input.size();
        
        // Pad to next power of 2
        size_t n_padded = 1;
        while (n_padded < n) {
            n_padded <<= 1;
        }

        std::vector<std::complex<double>> x(n_padded);
        for (size_t i = 0; i < n; ++i) {
            x[i] = std::complex<double>(input[i], 0.0);
        }
        for (size_t i = n; i < n_padded; ++i) {
            x[i] = std::complex<double>(0.0, 0.0);
        }

        // 1. Bit-reversal permutation
        for (size_t i = 1, j = 0; i < n_padded; i++) {
            size_t bit = n_padded >> 1;
            for (; j & bit; bit >>= 1) {
                j ^= bit;
            }
            j ^= bit;

            if (i < j) {
                std::swap(x[i], x[j]);
            }
        }

        // 2. Iterative butterflies
        for (size_t len = 2; len <= n_padded; len <<= 1) {
            double ang = 2.0 * M_PI / len;
            std::complex<double> wlen(std::cos(ang), -std::sin(ang));
            for (size_t i = 0; i < n_padded; i += len) {
                std::complex<double> w(1);
                for (size_t j = 0; j < len / 2; j++) {
                    std::complex<double> u = x[i + j];
                    std::complex<double> v = x[i + j + len / 2] * w;
                    x[i + j] = u + v;
                    x[i + j + len / 2] = u - v;
                    w *= wlen;
                }
            }
        }

        return x;
    }

    /**
     * Analyze frequency domain for anomalies
     * Detects unusual frequency patterns or power spikes
     */
    bool analyzeFrequencyDomain() {
        FrequencyDomain fd = analyze();
        
        if (fd.magnitudes.empty()) return false;

        // Calculate mean and stddev of magnitudes
        double mean_mag = std::accumulate(fd.magnitudes.begin(), fd.magnitudes.end(), 0.0) 
                         / fd.magnitudes.size();
        
        double variance = 0.0;
        for (double mag : fd.magnitudes) {
            double diff = mag - mean_mag;
            variance += diff * diff;
        }
        double stddev_mag = std::sqrt(variance / fd.magnitudes.size());

        // Check for high power spikes (anomalies)
        double max_magnitude = *std::max_element(fd.magnitudes.begin(), fd.magnitudes.end());
        
        // Anomaly if magnitude is > 3 sigma above mean
        if (stddev_mag > 0.0 && max_magnitude > mean_mag + 4.0 * stddev_mag) {
            return true;
        }

        // Check for unusual dominant frequency (outside normal range 0-50 Hz)
        if (fd.dominant_freq > 60.0) {
            return true;
        }

        // Check for excessive total power
        double avg_power = fd.total_power / fd.magnitudes.size();
        if (avg_power > 250.0) { // Adjusted threshold
            return true;
        }

        return false;
    }

    size_t window_size_;
    double sample_rate_;
    std::vector<double> samples_;
};

#endif // FFT_ANALYZER_HPP

