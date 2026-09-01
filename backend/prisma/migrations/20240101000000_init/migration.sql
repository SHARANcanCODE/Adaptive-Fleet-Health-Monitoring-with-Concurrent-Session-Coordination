-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperature_c" DOUBLE PRECISION NOT NULL,
    "vibration_g" DOUBLE PRECISION NOT NULL,
    "humidity_pct" DOUBLE PRECISION NOT NULL,
    "voltage_v" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "metricId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metrics_deviceId_ts_idx" ON "metrics"("deviceId", "ts");

-- CreateIndex
CREATE INDEX "metrics_ts_idx" ON "metrics"("ts");

-- CreateIndex
CREATE INDEX "anomalies_deviceId_ts_idx" ON "anomalies"("deviceId", "ts");

-- CreateIndex
CREATE INDEX "anomalies_ts_idx" ON "anomalies"("ts");

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "metrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

