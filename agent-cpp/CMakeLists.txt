cmake_minimum_required(VERSION 3.10)
project(IoTAgent VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(CURL REQUIRED)
find_package(PkgConfig REQUIRED)

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)
include_directories(${CMAKE_SOURCE_DIR}/third_party)

# Check for nlohmann/json (optional)
if(EXISTS "${CMAKE_SOURCE_DIR}/third_party/nlohmann/json.hpp")
    add_definitions(-DHAVE_NLOHMANN_JSON)
    message(STATUS "Found nlohmann/json - using it for JSON handling")
else()
    message(STATUS "nlohmann/json not found - using manual JSON formatting")
endif()

# Common source files
set(COMMON_SOURCES
    src/http_client.cpp
    src/config.cpp
)

set(COMMON_HEADERS
    include/http_client.hpp
    include/config.hpp
    include/local_analytics.hpp
    include/fft_analyzer.hpp
)

# Main agent executable (with local analytics)
set(AGENT_SOURCES
    src/main.cpp
    ${COMMON_SOURCES}
)

add_executable(agent ${AGENT_SOURCES} ${COMMON_HEADERS})
target_link_libraries(agent ${CURL_LIBRARIES})
target_compile_options(agent PRIVATE -Wall -Wextra -O2)

# Vibration sensor executable (with FFT + local analytics)
set(VIBRATION_SOURCES
    src/vibration_sensor.cpp
    ${COMMON_SOURCES}
)

add_executable(vibration_sensor ${VIBRATION_SOURCES} ${COMMON_HEADERS})
target_link_libraries(vibration_sensor ${CURL_LIBRARIES})
target_compile_options(vibration_sensor PRIVATE -Wall -Wextra -O2)

# Install targets
install(TARGETS agent vibration_sensor DESTINATION bin)

