import os
from google.genai import Client

def list_models():
    api_key = os.getenv("GEMINI_API_KEY")
    client = Client(api_key=api_key)
    for model in client.models.list():
        print(f"Model: {model.name}, Display: {model.display_name}")

if __name__ == "__main__":
    list_models()
