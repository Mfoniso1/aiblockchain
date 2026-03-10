from ultralytics import YOLO
import cv2

# Load YOLOv8 nano model (fastest, lightest for CPU inference)
# It will auto-download yolov8n.pt if not present in the directory.
try:
    model = YOLO('yolov8n.pt')
except Exception as e:
    print(f"Failed to load YOLOv8 model: {e}")
    model = None

# COCO Class mapping for suspicious objects in an exam context.
# Class IDs from COCO dataset (YOLOv8 default labels).
SUSPICIOUS_CLASSES = {
    0:  "person",      # Second person in room
    63: "laptop",      # Second screen / device
    64: "mouse",       # Computer peripherals (sign of second device)
    65: "remote",      # Remote / clicker (common cheat device)
    66: "keyboard",    # External keyboard (sign of second device)
    67: "cell phone",  # Mobile phone ← MOST IMPORTANT
    73: "book",        # Reference material
    76: "scissors",    # Unusual object
    77: "teddy bear",  # Covers lens
}

# Objects that are ALWAYS high-risk no matter their confidence level
HIGH_RISK_CLASSES = {67, 63}  # cell phone, laptop

def analyze_objects(bgr_image, conf_threshold=0.20) -> dict:
    """
    Runs YOLOv8 object detection on a BGR webcam frame to detect phones,
    books, laptops, or a second person.

    conf_threshold lowered to 0.20 so partially-occluded objects
    (e.g. phone held up in front of the face) are still caught.

    Returns dict:
        {
            "detected_objects": [{"class": "cell phone", "confidence": 0.85}],
            "object_threat_score": 0.95,
            "person_count": 1
        }
    """
    if model is None:
        return {
            "detected_objects": [],
            "object_threat_score": 0.0,
            "person_count": 0
        }

    # imgsz=640 ensures YOLO uses its native input resolution regardless of
    # what size frame arrives — improves small-object detection.
    results = model(bgr_image, verbose=False, imgsz=640)

    detected = []
    max_threat = 0.0

    # ── First pass: count persons separately ─────────────────────────────
    # We count all person detections BEFORE the main loop so that the
    # person-skipping logic doesn't accidentally suppress class-0 detections
    # that appear at the same time as a phone.
    person_count = sum(
        1 for r in results
        for box in r.boxes
        if int(box.cls[0]) == 0 and float(box.conf[0]) >= conf_threshold
    )

    # ── Second pass: collect suspicious objects ───────────────────────────
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            conf  = float(box.conf[0])

            if conf < conf_threshold:
                continue

            if cls_id not in SUSPICIOUS_CLASSES:
                continue

            obj_name = SUSPICIOUS_CLASSES[cls_id]

            # Skip the ONE primary student detected as a person.
            # Any additional persons are flagged as a threat.
            if cls_id == 0 and person_count <= 1:
                continue

            detected.append({
                "class":      obj_name,
                "confidence": round(conf, 3)
            })

            # High-risk objects get their threat score amplified to ensure
            # they reliably push the composite score into High Risk territory.
            threat_conf = conf
            if cls_id in HIGH_RISK_CLASSES:
                threat_conf = min(1.0, conf * 2.0)  # 2× boost for phone/laptop

            if threat_conf > max_threat:
                max_threat = threat_conf

    # Debug log — visible in the AI service terminal so you can verify detection
    if detected:
        print(f"[YOLO] ⚠ Suspicious objects: {[o['class'] for o in detected]} "
              f"| threat={max_threat:.2f} | persons={person_count}")

    return {
        "detected_objects":    detected,
        "object_threat_score": round(max_threat, 3),
        "person_count":        person_count
    }

if __name__ == "__main__":
    print("YOLOv8 Object Detector loaded successfully.")
