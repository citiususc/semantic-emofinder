FROM python:3.11-slim

WORKDIR /app

# Copiar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código y el .env
COPY . .

# Exponer el puerto del servidor
EXPOSE 3000

# Cargar las variables al ejecutar (opcional si tu código ya hace load_dotenv)
ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]