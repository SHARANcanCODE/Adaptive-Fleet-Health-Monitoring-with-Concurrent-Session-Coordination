#ifndef HTTP_CLIENT_HPP
#define HTTP_CLIENT_HPP

#include <atomic>
#include <condition_variable>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>

struct MetricPoint {
  double temperature_c;
  double vibration_g;
  double humidity_pct;
  double voltage_v;
  std::string ts; // ISO 8601 timestamp
};

class HttpClient {
public:
  HttpClient(const std::string &base_url);
  ~HttpClient();

  // POST metrics to /api/ingest (blocking)
  bool postMetrics(const std::string &device_id,
                   const std::vector<MetricPoint> &metrics);

  // POST metrics asynchronously (non-blocking)
  void postMetricsAsync(const std::string &device_id,
                        const std::vector<MetricPoint> &metrics);

  // Get last error message
  std::string getLastError() const;

  // Set API Key for ingest
  void setApiKey(const std::string &key) { api_key_ = key; }
  // Get API Key
  const std::string &getApiKey() const { return api_key_; }

private:
  std::string base_url_;
  std::string api_key_;
  mutable std::mutex error_mutex_;
  std::string last_error_;

  // Background worker for async requests
  struct RequestTask {
    std::string device_id;
    std::vector<MetricPoint> metrics;
  };

  std::queue<RequestTask> task_queue_;
  std::mutex queue_mutex_;
  std::condition_variable cv_;
  std::thread worker_thread_;
  std::atomic<bool> stop_worker_;

  void workerLoop();
  void setLastError(const std::string &error);

  // Helper to format JSON
  std::string formatMetricsJson(const std::string &device_id,
                                const std::vector<MetricPoint> &metrics);
};

#endif // HTTP_CLIENT_HPP
