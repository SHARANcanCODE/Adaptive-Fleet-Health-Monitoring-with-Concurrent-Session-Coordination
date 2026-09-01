cmake_minimum_required(VERSION 3.10)
project(agent_c)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Find required packages
find_package(PkgConfig REQUIRED)
pkg_check_modules(MOSQUITTO REQUIRED mosquitto)

# Include directories
include_directories(${MOSQUITTO_INCLUDE_DIRS})
include_directories(include)

# Source files
set(SOURCES
    src/main.c
    src/mqtt_client.c
)

# Executable
add_executable(agent-c ${SOURCES})

# Link libraries
target_link_libraries(agent-c ${MOSQUITTO_LIBRARIES})
target_compile_options(agent-c PRIVATE ${MOSQUITTO_CFLAGS_OTHER})

# Installation
install(TARGETS agent-c DESTINATION bin)

