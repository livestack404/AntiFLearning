"""Small CNN architecture for PneumoniaMNIST classification.

Includes hookable penultimate feature extraction for Mahalanobis OOD calculation
and explicit convolutional reference for PyTorch Grad-CAM explainability.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

class PneumoniaCNN(nn.Module):
    def __init__(
        self,
        in_channels: int = 1,
        num_classes: int = 2,
        conv1_channels: int = 16,
        conv2_channels: int = 32,
    ):
        super().__init__()
        self.conv1_channels = conv1_channels
        self.conv2_channels = conv2_channels

        # Conv block 1
        self.conv1 = nn.Conv2d(in_channels, conv1_channels, kernel_size=3, padding=1)
        self.relu1 = nn.ReLU()
        self.pool1 = nn.MaxPool2d(2, 2)

        # Conv block 2
        # Target conv layer for Grad-CAM explainability
        self.conv2 = nn.Conv2d(conv1_channels, conv2_channels, kernel_size=3, padding=1)
        self.relu2 = nn.ReLU()
        self.pool2 = nn.MaxPool2d(2, 2)

        # Size-independent adaptive pooling so any input size (28x28, 64x64, etc.) yields 7x7
        self.adaptive_pool = nn.AdaptiveAvgPool2d((7, 7))

        # Fully connected block
        self.flatten = nn.Flatten()
        self.fc1 = nn.Linear(conv2_channels * 7 * 7, 64)
        self.relu3 = nn.ReLU()
        self.dropout = nn.Dropout(0.2)
        self.fc2 = nn.Linear(64, num_classes)

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        """Extracts penultimate 64-dim representation for Mahalanobis OOD detection."""
        x = self.pool1(self.relu1(self.conv1(x)))
        x = self.pool2(self.relu2(self.conv2(x)))
        x = self.adaptive_pool(x)
        x = self.flatten(x)
        feat = self.relu3(self.fc1(x))
        return feat

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.extract_features(x)
        out = self.fc2(self.dropout(feat))
        return out

    def get_last_conv_layer(self) -> nn.Module:
        """Returns the last convolutional layer used by Grad-CAM."""
        return self.conv2
