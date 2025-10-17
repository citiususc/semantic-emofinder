// src/Finder.tsx
import React, { useState, ChangeEvent, FormEvent } from 'react';
import './Finder.css';
import './Databases.css';

interface Characteristic {
  id: number;
  name: string;
  min: string;
  max: string;
}

function Finder() {
  const [fileName, setFileName] = useState('');
  const [paper, setPaper] = useState('');
  const [url, setUrl] = useState('');
  const [words, setWords] = useState('');
  const [characteristics, setCharacteristics] = useState<Characteristic[]>([
    { id: 1, name: '', min: '', max: '' },
  ]);
  const [error, setError] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  // State for dataset file upload
  const [datasetFile, setDatasetFile] = useState<File | null>(null);

  const handleAddCharacteristic = () => {
    setCharacteristics(prev => [
      ...prev,
      { id: prev.length + 1, name: '', min: '', max: '' },
    ]);
  };

  const handleRemoveCharacteristic = (id: number) => {
    setCharacteristics(prev => prev.filter(c => c.id !== id));
  };

  const handleCharacteristicChange = (
    id: number,
    field: keyof Omit<Characteristic, 'id'>,
    value: string
  ) => {
    setCharacteristics(prev =>
      prev.map(c => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    setDatasetFile(file || null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !fileName || !paper || !url || !words || !datasetFile) {
      setError('Por favor rellena todos los campos obligatorios.');
      return;
    }
    // Build FormData for multipart upload
    const form = new FormData();
    form.append('contactName', contactName);
    form.append('contactEmail', contactEmail);
    form.append('fileName', fileName);
    form.append('paper', paper);
    form.append('url', url);
    form.append('words', words);
    form.append('datasetFile', datasetFile);
    characteristics
      .filter(c => c.name)
      .forEach((c, i) => {
        form.append(`characteristics[${i}].name`, c.name);
        form.append(`characteristics[${i}].min`, c.min);
        form.append(`characteristics[${i}].max`, c.max);
      });
    // Debug: log all form data entries
    for (const [key, value] of form.entries()) {
      console.log('FormData entry:', key, value);
    }
    try {
      const response = await fetch('http://127.0.0.1:3000/api/create-issue', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const errorData = await response.json();
        setError(`Error al crear issue: ${errorData.detail || response.statusText}`);
        return;
      }
      const data = await response.json();
      window.open(data.url, '_blank');
      // Reset form
      setContactName(''); setContactEmail('');
      setFileName(''); setPaper(''); setUrl(''); setWords('');
      setDatasetFile(null);
      setCharacteristics([{ id: 1, name: '', min: '', max: '' }]);
      setError('');
    } catch (err) {
      setError('Error de conexión con el servidor.');
    }
  };

  return (
    <div className="upload-container">
      <h3 className="upload-title">Sube tu propio dataset de palabras</h3>
      <form onSubmit={handleSubmit} className="upload-form">
        <div className="form-group">
          <label>Nombre del responsable:</label>
          <input
            type="text"
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            className="input"
            placeholder="Ej. Juan Pérez"
            required
          />
        </div>
        <div className="form-group">
          <label>Email de contacto:</label>
          <input
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            className="input"
            placeholder="ejemplo@dominio.com"
            required
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="form-group">
          <label>Nombre del dataset:</label>
          <input
            type="text"
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            className="input"
            placeholder="Ej. Spanish Affective Norms"
            required
          />
        </div>
        <div className="form-group">
          <label>Paper de referencia:</label>
          <input
            type="text"
            value={paper}
            onChange={e => setPaper(e.target.value)}
            className="input"
            placeholder="Autor, año, título..."
            required
          />
        </div>
        <div className="form-group">
          <label>URL del paper:</label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="input"
            placeholder="https://doi.org/..."
            required
          />
        </div>
        <div className="form-group">
          <label>Número de palabras:</label>
          <input
            type="number"
            value={words}
            onChange={e => setWords(e.target.value)}
            className="input"
            placeholder="Ej. 1400"
            required
            min="1"
          />
        </div>
        <div className="form-group">
          <label>Archivo de datos (CSV o JSON):</label>
          <input
            type="file"
            accept=".csv,application/json"
            onChange={handleFileChange}
            className="input-file"
            required
          />
        </div>
        <h3>Características y rangos</h3>
        {characteristics.map(c => (
          <div key={c.id} className="char-row">
            <input
              type="text"
              value={c.name}
              onChange={e => handleCharacteristicChange(c.id, 'name', e.target.value)}
              className="input char-name"
              placeholder="Nombre característica"
              required
            />
            <input
              type="number"
              value={c.min}
              onChange={e => handleCharacteristicChange(c.id, 'min', e.target.value)}
              className="input char-range"
              placeholder="Mín"
            />
            <input
              type="number"
              value={c.max}
              onChange={e => handleCharacteristicChange(c.id, 'max', e.target.value)}
              className="input char-range"
              placeholder="Máx"
            />
            <button type="button" onClick={() => handleRemoveCharacteristic(c.id)} className="remove-button">
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={handleAddCharacteristic} className="add-button">
          +
        </button>
        <button type="submit" className="button-primary">
          Subir Dataset
        </button>
      </form>
    </div>
  );
}

export default Finder;