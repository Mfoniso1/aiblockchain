"""
cnn_model.py
───────────────────────────────────────────────────────────────────────────────
CNN Architecture — PhD Research Component (aiblock.md Part 1)

Provides two model variants:
  1. build_model()          — Production model (128x128, 3 conv blocks, trained)
  2. build_research_model() — Research-grade model (224x224, 5 conv blocks,
                               batch normalisation, dropout) — for viva defense
  3. build_action_model()   — Temporal CNN+LSTM sequence model (Phase 4 upgrade)
"""

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import (
    Conv2D, MaxPooling2D, Flatten, Dense, Dropout,
    BatchNormalization, GlobalAveragePooling2D, Input
)
from tensorflow.keras.regularizers import l2


# ── Model 1: Production (deployed in exam_fraud_model.h5) ────────────────────
def build_model(input_shape=(128, 128, 3)):
    """
    Lightweight CNN for real-time fraud detection.
    Designed for <200ms inference latency per frame.

    Architecture:
        3 × Conv2D block (32→64→128 filters)
        MaxPooling2D after each block
        Flatten → Dense(512) → Dropout(0.5) → Sigmoid
    """
    model = Sequential([
        # ── Block 1 ───────────────────────────────────────────────────────
        Conv2D(32, (3, 3), activation='relu', padding='same',
               input_shape=input_shape, name='conv1'),
        MaxPooling2D(2, 2, name='pool1'),

        # ── Block 2 ───────────────────────────────────────────────────────
        Conv2D(64, (3, 3), activation='relu', padding='same', name='conv2'),
        MaxPooling2D(2, 2, name='pool2'),

        # ── Block 3 ───────────────────────────────────────────────────────
        Conv2D(128, (3, 3), activation='relu', padding='same', name='conv3'),
        MaxPooling2D(2, 2, name='pool3'),

        # ── Classification head ───────────────────────────────────────────
        Flatten(name='flatten'),
        Dense(512, activation='relu', name='fc1'),
        Dropout(0.5, name='dropout'),
        Dense(1, activation='sigmoid', name='output'),   # Binary: fraud vs normal
    ], name='ExamFraud_CNN_v1')

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss='binary_crossentropy',
        metrics=['accuracy', tf.keras.metrics.Precision(name='precision'),
                 tf.keras.metrics.Recall(name='recall')]
    )
    return model


# ── Model 2: Research-grade (aiblock.md spec) ─────────────────────────────────
def build_research_model(input_shape=(224, 224, 3)):
    """
    Advanced CNN with 5 convolutional blocks and batch normalisation.
    Designed for PhD viva defense — demonstrates deeper architecture
    and regularisation techniques.

    Architecture:
        5 × ConvBlock (32→64→128→256→512 filters)
        Each block: Conv2D → BatchNorm → ReLU → MaxPool
        GlobalAveragePooling2D → Dense(256) → Dropout → Sigmoid

    Parameters
    ----------
    input_shape : tuple
        Default (224, 224, 3) as per aiblock.md spec.

    Notes
    -----
    BatchNormalization after each conv stabilises training and
    allows deeper networks without vanishing gradients.
    L2 regularisation prevents overfitting on small fraud datasets.
    """
    def conv_block(filters, name_prefix):
        return [
            Conv2D(filters, (3, 3), padding='same', use_bias=False,
                   kernel_regularizer=l2(1e-4), name=f'{name_prefix}_conv'),
            BatchNormalization(name=f'{name_prefix}_bn'),
            tf.keras.layers.Activation('relu', name=f'{name_prefix}_relu'),
            MaxPooling2D(2, 2, name=f'{name_prefix}_pool'),
            Dropout(0.25, name=f'{name_prefix}_drop'),
        ]

    model = Sequential(name='ExamFraud_CNN_v2_Research')
    model.add(Input(shape=input_shape, name='input'))

    # 5 convolutional blocks (32→64→128→256→512)
    for i, filters in enumerate([32, 64, 128, 256, 512], start=1):
        for layer in conv_block(filters, f'block{i}'):
            model.add(layer)

    # Global Average Pooling (replaces Flatten — fewer params, better generalisation)
    model.add(GlobalAveragePooling2D(name='gap'))
    model.add(Dense(256, activation='relu', kernel_regularizer=l2(1e-4), name='fc1'))
    model.add(Dropout(0.5, name='fc_dropout'))
    model.add(Dense(1, activation='sigmoid', name='output'))

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
        loss='binary_crossentropy',
        metrics=['accuracy',
                 tf.keras.metrics.Precision(name='precision'),
                 tf.keras.metrics.Recall(name='recall'),
                 tf.keras.metrics.AUC(name='auc')]
    )
    return model


# ── CLI: print summaries ──────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  ExamFraud CNN v1 — Production (128×128)")
    print("=" * 60)
    m1 = build_model()
    m1.summary()

    print("\n" + "=" * 60)
    print("  ExamFraud CNN v2 — Research (224×224 + BatchNorm)")
    print("=" * 60)
    m2 = build_research_model()
    m2.summary()
    
    try:
        from action_model import build_action_model
        print("\n" + "=" * 60)
        print("  ExamFraud Phase 4 — CNN + LSTM Action Sequence Model")
        print("=" * 60)
        m3 = build_action_model()
        m3.summary()
    except Exception as e:
        print(f"Failed to load action model: {e}")
