import cv2
import time
import numpy as np
from gaze_tracker import analyze_gaze
from object_detector import analyze_objects

# Also include basic face detection from main.py's logic
FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

def analyze_faces_basic(bgr_img):
    gray = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2GRAY)
    faces = FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    return len(faces) > 0, len(faces)

def main():
    print("Opening webcam (press 'q' to quit)...")
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Could not open the webcam.")
        return

    # To avoid overloading the CPU, only process every nth frame
    frame_count = 0
    process_every = 5
    
    last_print_time = time.time()
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame.")
            break
            
        frame_count += 1
        
        if frame_count % process_every == 0:
            # 1. Face Detection
            face_detected, num_faces = analyze_faces_basic(frame)
            
            # 2. Gaze Tracking
            gaze_status = "unknown"
            if face_detected:
                try:
                    gaze_res = analyze_gaze(frame)
                    gaze_status = gaze_res.get("gaze_direction", "unknown")
                except Exception as e:
                    gaze_status = f"error: {e}"
            
            # 3. Object Detection (YOLOv8)
            try:
                obj_res = analyze_objects(frame)
                objects_found = obj_res.get("detected_objects", [])
            except Exception as e:
                objects_found = [f"error: {e}"]
                
            # Print output every 1 second
            current_time = time.time()
            if current_time - last_print_time > 1.0:
                print(f"--- Frame Analysis ---")
                print(f"Faces identified: {num_faces}")
                print(f"Eye Gaze status: {gaze_status}")
                print(f"Objects detected: {objects_found}")
                last_print_time = current_time

            # Update frame display
            cv2.putText(frame, f"Faces: {num_faces}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Gaze: {gaze_status}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Objects: {len(objects_found)}", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
        cv2.imshow("AI Real-Time Test (Press 'q' to close)", frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("Webcam closed.")

if __name__ == "__main__":
    main()
