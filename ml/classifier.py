"""Clasificador supervisado de tickets (TF-IDF + regresión logística).

Uso:
    python ml/classifier.py train [--csv ruta/tickets.csv]
    echo '{"message": "..."}' | python ml/classifier.py predict
"""
import argparse
import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

BASE = Path(__file__).resolve().parent
DEFAULT_CSV = BASE / "tickets.csv"
MODEL_PATH = BASE / "ticket-model.joblib"


def build_model():
    # El Pipeline garantiza que TF-IDF se ajuste únicamente con los datos que
    # reciba fit(): así el vocabulario nunca se calcula con el conjunto de prueba.
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
        ("classifier", LogisticRegression(max_iter=1000)),
    ])


def train(csv_path):
    data = pd.read_csv(csv_path, encoding="utf-8").dropna(subset=["message", "category"])

    # 1) Se divide ANTES de ajustar cualquier transformación (evita data leakage).
    X_train, X_test, y_train, y_test = train_test_split(
        data["message"], data["category"], test_size=0.2,
        stratify=data["category"], random_state=42,
    )

    # 2) Evaluación honesta: se entrena con train y se mide con test.
    evaluation_model = build_model()
    evaluation_model.fit(X_train, y_train)
    print(f"Ejemplos: {len(data)} (entrenamiento {len(X_train)}, prueba {len(X_test)})")
    print(classification_report(y_test, evaluation_model.predict(X_test), zero_division=0))

    # 3) Modelo final de la API: ya validado, se reentrena con todo el CSV.
    final_model = build_model()
    final_model.fit(data["message"], data["category"])
    joblib.dump(final_model, MODEL_PATH)
    print(f"Modelo guardado en {MODEL_PATH}")


def predict():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    message = json.loads(sys.stdin.read())["message"]
    model = joblib.load(MODEL_PATH)
    probabilities = model.predict_proba([message])[0]
    best = probabilities.argmax()
    print(json.dumps({
        "category": str(model.classes_[best]),
        "confidence": round(float(probabilities[best]), 4),
    }))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    train_parser = sub.add_parser("train")
    train_parser.add_argument("--csv", default=str(DEFAULT_CSV))
    sub.add_parser("predict")
    args = parser.parse_args()

    if args.command == "train":
        train(args.csv)
    else:
        predict()


if __name__ == "__main__":
    main()
