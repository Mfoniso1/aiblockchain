import cv2
import mediapipe as mp
import numpy as np
import os

# MediaPipe Tasks API (compatible with mediapipe v0.10+)
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python.vision import FaceLandmarkerOptions, FaceLandmarker, RunningMode

# Path to the face landmarker model
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")

# Landmark indices (same as before, mediapipe 478-landmark model)
LEFT_EYE_INNER = 133
LEFT_EYE_OUTER = 33
RIGHT_EYE_INNER = 362
RIGHT_EYE_OUTER = 263
LEFT_IRIS_CENTER = 468
RIGHT_IRIS_CENTER = 473

# Initialize FaceLandmarker (new Tasks API)
_options = FaceLandmarkerOptions(
    base_options=mp_tasks.BaseOptions(model_asset_path=_MODEL_PATH),
    running_mode=RunningMode.IMAGE,
    num_faces=1,
    min_face_detection_confidence=0.5,
    min_face_presence_confidence=0.5,
    min_tracking_confidence=0.5,
    output_face_blendshapes=False,
    output_facial_transformation_matrixes=False,
)

face_landmarker = FaceLandmarker.create_from_options(_options)


def compute_gaze_ratio(landmarks, img_w, img_h, eye_inner, eye_outer, iris_center):
    """
    Computes horizontal gaze ratio (0=far left, 1=far right).
    """
    inner_x = landmarks[eye_inner].x * img_w
    outer_x = landmarks[eye_outer].x * img_w
    iris_x  = landmarks[iris_center].x * img_w

    eye_width = abs(outer_x - inner_x)
    if eye_width < 1e-6:
        return 0.5

    leftmost = min(inner_x, outer_x)
    return (iris_x - leftmost) / eye_width


def analyze_gaze(bgr_image) -> dict:
    """
    Takes a BGR frame from OpenCV, extracts iris landmarks,
    and classifies current gaze direction.

    Returns dict:
        {
            "gaze_direction": "center" | "left" | "right",
            "is_off_screen": bool,
            "success": bool
        }
    """
    h, w, _ = bgr_image.shape
    rgb_img = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)

    # Convert to mediapipe Image format (new API)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_img)
    results = face_landmarker.detect(mp_image)

    if not results.face_landmarks:
        return {
            "gaze_direction": "unknown",
            "is_off_screen": True,
            "success": False
        }

    # face_landmarks[0] is a list of NormalizedLandmark objects
    landmarks = results.face_landmarks[0]

    # Compute horizontal gaze ratios
    left_ratio  = compute_gaze_ratio(landmarks, w, h, LEFT_EYE_INNER, LEFT_EYE_OUTER, LEFT_IRIS_CENTER)
    right_ratio = compute_gaze_ratio(landmarks, w, h, RIGHT_EYE_INNER, RIGHT_EYE_OUTER, RIGHT_IRIS_CENTER)

    avg_ratio = (left_ratio + right_ratio) / 2.0

    threshold = 0.35

    if avg_ratio < threshold:
        direction = "right"
        off_screen = True
    elif avg_ratio > (1.0 - threshold):
        direction = "left"
        off_screen = True
    else:
        direction = "center"
        off_screen = False

    return {
        "gaze_direction": direction,
        "is_off_screen": off_screen,
        "success": True,
        "raw_ratio": round(avg_ratio, 3)
    }


if __name__ == "__main__":
    print("Gaze Tracker loaded.")
