#include "http_client.hpp"
#include <curl/curl.h>
#include <iomanip>
#include <iostream>
#include <sstream>

namespace {
// Callback for writing response data
size_t WriteCallback(void *contents, size_t size, size_t nmemb,
                     std::string *data) {
  size_t total_size = size * nmemb;
  data->append((char *)contents, total_size);
  return total_size;
}
} // namespace

HttpClient::HttpClient(const std::string &base_url)
    : base_url_(base_url), stop_worker_(false) {
  curl_global_init(CURL_GLOBAL_DEFAULT);
  worker_thread_ = std::thread(&HttpClient::workerLoop, this);
}

HttpClient::~HttpClient() {
  stop_worker_ = true;
  cv_.notify_all();
  if (worker_thread_.joinable()) {
    worker_thread_.join();
  }
  curl_global_cleanup();
}

std::string HttpClient::getLastError() const {
  std::lock_guard<std::mutex> lock(error_mutex_);
  return last_error_;
}

void HttpClient::setLastError(const std::string &error) {
  std::lock_guard<std::mutex> lock(error_mutex_);
  last_error_ = error;
}

void HttpClient::postMetricsAsync(const std::string &device_id,
                                  const std::vector<MetricPoint> &metrics) {
  {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    task_queue_.push({device_id, metrics});
  }
  cv_.notify_one();
}

void HttpClient::workerLoop() {
  while (!stop_worker_) {
    RequestTask task;
    {
      std::unique_lock<std::mutex> lock(queue_mutex_);
      cv_.wait(lock, [this] { return !task_queue_.empty() || stop_worker_; });

      if (stop_worker_ && task_queue_.empty())
        break;

      task = std::move(task_queue_.front());
      task_queue_.pop();
    }

    // Perform the actual POST (blocking call within worker thread)
    postMetrics(task.device_id, task.metrics);
  }
}

std::string
HttpClient::formatMetricsJson(const std::string &device_id,
                              const std::vector<MetricPoint> &metrics) {
  std::ostringstream json;
  json << std::fixed << std::setprecision(2);

  json << "{\n";
  json << "  \"deviceId\": \"" << device_id << "\",\n";
  json << "  \"metrics\": [\n";

  for (size_t i = 0; i < metrics.size(); i++) {
    const auto &m = metrics[i];
    json << "    {\n";
    if (!m.ts.empty()) {
      json << "      \"ts\": \"" << m.ts << "\",\n";
    }
    json << "      \"temperature_c\": " << m.temperature_c << ",\n";
    json << "      \"vibration_g\": " << m.vibration_g << ",\n";
    json << "      \"humidity_pct\": " << m.humidity_pct << ",\n";
    json << "      \"voltage_v\": " << m.voltage_v << "\n";
    json << "    }";
    if (i < metrics.size() - 1)
      json << ",";
    json << "\n";
  }

  json << "  ]\n";
  json << "}";

  return json.str();
}

bool HttpClient::postMetrics(const std::string &device_id,
                             const std::vector<MetricPoint> &metrics) {
  if (metrics.empty()) {
    setLastError("No metrics to send");
    return false;
  }

  CURL *curl = curl_easy_init();
  if (!curl) {
    setLastError("Failed to initialize CURL");
    return false;
  }

  std::string json_data = formatMetricsJson(device_id, metrics);
  std::string response_data;

  std::string url = base_url_ + "/api/ingest";

  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_data.c_str());
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_data);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L); // 10s timeout

  struct curl_slist *headers = nullptr;
  headers = curl_slist_append(headers, "Content-Type: application/json");
  if (!api_key_.empty()) {
    std::string auth_header = "X-API-Key: " + api_key_;
    headers = curl_slist_append(headers, auth_header.c_str());
  }
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

  CURLcode res = curl_easy_perform(curl);

  long response_code = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response_code);

  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);

  if (res != CURLE_OK) {
    setLastError("CURL error: " + std::string(curl_easy_strerror(res)));
    return false;
  }

  if (response_code < 200 || response_code >= 300) {
    setLastError("HTTP error: " + std::to_string(response_code) + " - " +
                 response_data);
    return false;
  }

  return true;
}
