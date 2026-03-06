import sys
import os

# Add project root to path so app.py can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app
