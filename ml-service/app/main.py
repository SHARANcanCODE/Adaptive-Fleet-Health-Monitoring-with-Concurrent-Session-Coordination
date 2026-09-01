"""
FastAPI service for Isolation Forest anomaly detection
"""

import os
import pickle
from typing import List, Optional, Dict
from datetime import datetime
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="IoT Anomaly Detection ML Service")

# Configuration from environment
ISOFOREST_WINDOW = int(os.getenv("ISOFOREST_WINDOW", "512"))
ISOFOREST_CONTAM = float(os.getenv("ISOFOREST_CONTAM", "0.03"))
ISOFOREST_THRESHOLD = float(os.getenv("ISOFOREST_THRESHOLD", "0.65"))
MODEL_DIR = os.getenv("MODEL_DIR", "./models")
# How many new points before we re-train?
RETRAIN_INTERVAL = int(os.getenv("RETRAIN_INTERVAL", "100"))

# Create model directory
Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)

# In-memory storage for active models
models: Dict[str, IsolationForest] = {}
scalers: Dict[str, StandardScaler] = {}
device_windows: Dict[str, List[dict]] = {}
points_since_train: Dict[str, int] = {}


class MetricPoint(BaseModel):
    ts: str
    temperature_c: float
    vibration_g: float
    humidity_pct: float
    voltage_v: float


class ScoreBatchRequest(BaseModel):
    deviceId: str
    points: List[MetricPoint]


class ScoredPoint(BaseModel):
    index: int
    score: float
    isAnomaly: bool


class ScoreBatchResponse(BaseModel):
    scores: List[ScoredPoint]


def extract_features(points: List[MetricPoint]) -> np.ndarray:
    """Extract feature matrix from metric points"""
    features = []
    for point in points:
        features.append([
            point.temperature_c,
            point.vibration_g,
            point.humidity_pct,
            point.voltage_v
        ])
    return np.array(features)


def get_model_path(device_id: str) -> Path:
    return Path(MODEL_DIR) / f"{device_id}.pkl"


def save_model(device_id: str, model: IsolationForest, scaler: StandardScaler):
    """Persist model and scaler to disk"""
    try:
        with open(get_model_path(device_id), "wb") as f:
            pickle.dump({"model": model, "scaler": scaler}, f)
    except Exception as e:
        logger.error(f"Failed to save model for {device_id}: {e}")


def load_model(device_id: str) -> Optional[tuple[IsolationForest, StandardScaler]]:
    """Load model and scaler from disk if they exist"""
    path = get_model_path(device_id)
    if path.exists():
        try:
            with open(path, "rb") as f:
                data = pickle.load(f)
                return data["model"], data["scaler"]
        except Exception as e:
            logger.error(f"Failed to load model for {device_id}: {e}")
    return None


def get_or_create_model(device_id: str) -> tuple[IsolationForest, StandardScaler]:
    """Get existing model (memory or disk) or create new one"""
    if device_id in models:
        return models[device_id], scalers[device_id]
    
    # Try loading from disk
    persisted = load_model(device_id)
    if persisted:
        model, scaler = persisted
        models[device_id] = model
        scalers[device_id] = scaler
        return model, scaler

    # Create new model if none exists
    model = IsolationForest(
        n_estimators=100,
        contamination=ISOFOREST_CONTAM,
        random_state=42
    )
    scaler = StandardScaler()
    
    models[device_id] = model
    scalers[device_id] = scaler
    
    logger.info(f"Created new model for device {device_id}")
    return model, scaler


def update_model_window(device_id: str, points: List[MetricPoint]):
    """Maintain sliding window for device"""
    if device_id not in device_windows:
        device_windows[device_id] = []
    
    window = device_windows[device_id]
    window.extend([p.dict() for p in points])
    
    # Keep only last N points
    if len(window) > ISOFOREST_WINDOW:
        device_windows[device_id] = window[-ISOFOREST_WINDOW:]
    
    # Track growth for re-training trigger
    points_since_train[device_id] = points_since_train.get(device_id, 0) + len(points)


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "ok": True, 
        "service": "ml-anomaly-detection",
        "active_models": len(models),
        "persisted_models": len(list(Path(MODEL_DIR).glob("*.pkl")))
    }


@app.get("/models")
async def list_models():
    """List all tracked devices and their status"""
    all_device_ids = set(list(models.keys()) + [p.stem for p in Path(MODEL_DIR).glob("*.pkl")])
    return {
        "devices": [
            {
                "deviceId": d_id,
                "inMemory": d_id in models,
                "persisted": get_model_path(d_id).exists(),
                "pointsSinceTrain": points_since_train.get(d_id, 0),
                "windowSize": len(device_windows.get(d_id, []))
            } 
            for d_id in all_device_ids
        ]
    }


@app.delete("/models/{device_id}")
async def delete_model(device_id: str):
    """Purge a model from memory and disk"""
    models.pop(device_id, None)
    scalers.pop(device_id, None)
    device_windows.pop(device_id, None)
    points_since_train.pop(device_id, None)
    
    path = get_model_path(device_id)
    if path.exists():
        try:
            path.unlink()
        except Exception as e:
            logger.error(f"Failed to delete model file for {device_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to delete model file: {e}")
        
    return {"success": True, "deviceId": device_id}


@app.post("/score-batch", response_model=ScoreBatchResponse)
async def score_batch(request: ScoreBatchRequest):
    """
    Score a batch of metric points for anomalies using Isolation Forest
    """
    try:
        device_id = request.deviceId
        points = request.points
        
        if not points:
            raise HTTPException(status_code=400, detail="No points provided")
        
        # Get or create model for device
        model, scaler = get_or_create_model(device_id)
        
        # Update window
        update_model_window(device_id, points)
        
        # Get training window
        window = device_windows[device_id]
        window_size = len(window)
        
        # Re-training trigger logic
        is_trained = hasattr(model, 'offset_')
        should_train = not is_trained and window_size >= 100
        # Aggressive re-training for small windows, sparse for large
        if is_trained and points_since_train.get(device_id, 0) >= RETRAIN_INTERVAL:
            should_train = True

        if should_train:
            logger.info(f"Re-training model for device {device_id} (window size: {window_size})")
            train_features = extract_features([MetricPoint(**p) for p in window])
            train_scaled = scaler.fit_transform(train_features)
            model.fit(train_scaled)
            points_since_train[device_id] = 0
            # Save progress
            save_model(device_id, model, scaler)
        
        # Check if we have a trained model to use
        if not hasattr(model, 'offset_'):
            # Not enough data yet, return neutral scores
            scores = [ScoredPoint(index=i, score=0.5, isAnomaly=False) 
                     for i in range(len(points))]
            return ScoreBatchResponse(scores=scores)
        
        # Score the batch (using the fitted model)
        features = extract_features(points)
        input_scaled = scaler.transform(features)
        
        # Predict returns -1 for anomaly, 1 for normal
        predictions = model.predict(input_scaled)
        
        # Get scores (higher = more normal, but score_samples returns raw value)
        # We normalize to [0, 1] where closer to 1 means more anomalous
        scores_raw = model.score_samples(input_scaled)
        
        # Isolation Forest score_samples returns values. Lower means more anomalous.
        # We invert so higher = more anomalous for consistent dashboard coloring.
        # Shift so 1.0 is max anomaly, 0.0 is max normal.
        # Isolation Forest scores typically range from -1.0 to 0.0 roughly.
        scores_normalized = 1.0 / (1.0 + np.exp(scores_raw * 10)) # Sharper sigmoid

        # Build response
        scored_points = []
        for i, (pred, score) in enumerate(zip(predictions, scores_normalized)):
            is_anomaly = pred == -1 or score > ISOFOREST_THRESHOLD
            scored_points.append(ScoredPoint(
                index=i,
                score=float(score),
                isAnomaly=bool(is_anomaly)
            ))
        
        return ScoreBatchResponse(scores=scored_points)
        
    except Exception as e:
        logger.error(f"Error scoring batch: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

