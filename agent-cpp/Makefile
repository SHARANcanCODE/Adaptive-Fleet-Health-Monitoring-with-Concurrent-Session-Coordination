.PHONY: build clean run run-vibration

BUILD_DIR = build

build:
	@mkdir -p $(BUILD_DIR)
	cd $(BUILD_DIR) && cmake .. && make

clean:
	rm -rf $(BUILD_DIR)

run: build
	cd $(BUILD_DIR) && ./agent

run-vibration: build
	cd $(BUILD_DIR) && ./vibration_sensor

