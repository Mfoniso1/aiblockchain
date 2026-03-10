import os
import numpy as np
import cv2
from sklearn.datasets import fetch_lfw_people
from pathlib import Path

# Config
DATASET_DIR = Path("dataset")
TRAIN_DIR = DATASET_DIR / "train"
VAL_DIR = DATASET_DIR / "validation"
IMG_SIZE = 128

def create_dirs():
    for category in ["normal", "fraud"]:
        (TRAIN_DIR / category).mkdir(parents=True, exist_ok=True)
        (VAL_DIR / category).mkdir(parents=True, exist_ok=True)

def save_images(images, subset, category, prefix):
    count = 0
    directory = TRAIN_DIR / category if subset == "train" else VAL_DIR / category
    
    for img in images:
        # LFW images are float32 [0, 1] or [0, 255]. Check and convert.
        if img.max() <= 1.0:
            img = (img * 255).astype(np.uint8)
        else:
            img = img.astype(np.uint8)
            
        # Resize to 128x128 if needed (LFW resize=0.5 might give different size)
        img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))
        
        # Convert RGB to BGR for OpenCV
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        
        cv2.imwrite(str(directory / f"{prefix}_{count}.jpg"), img)
        count += 1
    print(f"Saved {count} {category} images to {directory}")

def generate_fraud_samples(num_samples, subset):
    # Generates noise/blank images to simulate "Camera Covered" or "No Face"
    directory = TRAIN_DIR / "fraud" if subset == "train" else VAL_DIR / "fraud"
    
    for i in range(num_samples):
        # type 1: Black image (camera covered)
        if i % 2 == 0:
            img = np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        # type 2: Random Noise
        else:
            img = np.random.randint(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
            
        cv2.imwrite(str(directory / f"fraud_{i}.jpg"), img)
    print(f"Generated {num_samples} fraud samples in {directory}")

def main():
    print("Creating dataset structure...")
    create_dirs()

    print("Downloading LFW dataset (this may take a few minutes)...")
    # Download LFW faces
    lfw_people = fetch_lfw_people(min_faces_per_person=5, resize=1.0, color=True, slice_=None)
    
    images = lfw_people.images
    print(f"Downloaded {len(images)} images from LFW.")

    # Split: 80% Train, 20% Validation
    split_idx = int(len(images) * 0.8)
    train_faces = images[:split_idx]
    val_faces = images[split_idx:]

    print("Saving 'Normal' (Face) images...")
    save_images(train_faces, "train", "normal", "lfw")
    save_images(val_faces, "validation", "normal", "lfw")

    print("Generating 'Fraud' (No Face) images...")
    # Generate balanced dataset
    generate_fraud_samples(len(train_faces), "train")
    generate_fraud_samples(len(val_faces), "validation")

    print("Dataset preparation complete!")
    print(f"Train/Normal: {len(train_faces)}")
    print(f"Train/Fraud: {len(train_faces)}")

if __name__ == "__main__":
    main()
