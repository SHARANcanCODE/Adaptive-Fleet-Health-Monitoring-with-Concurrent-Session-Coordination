.PHONY: build clean run

BUILD_DIR = build
TARGET = $(BUILD_DIR)/agent-c

build: $(TARGET)

$(TARGET):
	mkdir -p $(BUILD_DIR)
	cd $(BUILD_DIR) && cmake .. && make

clean:
	rm -rf $(BUILD_DIR)

run: build
	./$(TARGET)

run-local: build
	./$(TARGET) --mqtt=mqtt://localhost:1883

