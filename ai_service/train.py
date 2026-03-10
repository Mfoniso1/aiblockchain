import os
import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from cnn_model import build_model
import matplotlib.pyplot as plt

# Define Dataset Paths
# Ensure your dataset is organized as:
# dataset/
#   train/
#     normal/
#     fraud/
#   validation/
#     normal/
#     fraud/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, 'dataset')
TRAIN_DIR = os.path.join(DATASET_DIR, 'train')
VALIDATION_DIR = os.path.join(DATASET_DIR, 'validation')

# Image Dimensions
IMG_HEIGHT = 128
IMG_WIDTH = 128
BATCH_SIZE = 32

def train_model():
    if not os.path.exists(TRAIN_DIR):
        print(f"Error: Dataset not found at {TRAIN_DIR}")
        print("Please download the dataset and extract it to the 'dataset' folder.")
        return

    # Data Generators (Augmentation for Training)
    train_datagen = ImageDataGenerator(
        rescale=1./255,
        rotation_range=20,
        width_shift_range=0.2,
        height_shift_range=0.2,
        shear_range=0.2,
        zoom_range=0.2,
        horizontal_flip=True,
        fill_mode='nearest'
    )

    validation_datagen = ImageDataGenerator(rescale=1./255)

    train_generator = train_datagen.flow_from_directory(
        TRAIN_DIR,
        target_size=(IMG_HEIGHT, IMG_WIDTH),
        batch_size=BATCH_SIZE,
        class_mode='binary'
    )

    validation_generator = validation_datagen.flow_from_directory(
        VALIDATION_DIR,
        target_size=(IMG_HEIGHT, IMG_WIDTH),
        batch_size=BATCH_SIZE,
        class_mode='binary'
    )

    # Build and Train Model
    model = build_model((IMG_HEIGHT, IMG_WIDTH, 3))
    
    history = model.fit(
        train_generator,
        steps_per_epoch=max(1, train_generator.samples // BATCH_SIZE),
        epochs=5, # Reduced for testing
        validation_data=validation_generator,
        validation_steps=max(1, validation_generator.samples // BATCH_SIZE)
    )

    # Save Model
    model.save('exam_fraud_model.h5')
    print("Model saved to exam_fraud_model.h5")

    # Plot Accuracy and Loss
    acc = history.history['accuracy']
    val_acc = history.history['val_accuracy']
    loss = history.history['loss']
    val_loss = history.history['val_loss']

    epochs_range = range(len(acc))

    plt.figure(figsize=(8, 8))
    plt.subplot(1, 2, 1)
    plt.plot(epochs_range, acc, label='Training Accuracy')
    plt.plot(epochs_range, val_acc, label='Validation Accuracy')
    plt.legend(loc='lower right')
    plt.title('Training and Validation Accuracy')

    plt.subplot(1, 2, 2)
    plt.plot(epochs_range, loss, label='Training Loss')
    plt.plot(epochs_range, val_loss, label='Validation Loss')
    plt.legend(loc='upper right')
    plt.title('Training and Validation Loss')
    plt.savefig('training_history.png')
    # plt.show()

if __name__ == "__main__":
    train_model()
