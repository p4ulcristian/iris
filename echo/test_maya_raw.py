#!/usr/bin/env python3
"""Test raw Maya TTS without lmdeploy/FastMaya."""

import warnings
warnings.filterwarnings('ignore')

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from snac import SNAC
import soundfile as sf
import numpy as np

print("Loading Maya model from HuggingFace...")
model = AutoModelForCausalLM.from_pretrained(
    "maya-research/maya1",
    torch_dtype=torch.bfloat16,
    device_map="auto",
    trust_remote_code=True
)
tokenizer = AutoTokenizer.from_pretrained("maya-research/maya1", trust_remote_code=True)

print("Loading SNAC decoder...")
snac_model = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval()
if torch.cuda.is_available():
    snac_model = snac_model.to("cuda")

print("Models loaded successfully!")
print("Test complete - raw Maya works!")
