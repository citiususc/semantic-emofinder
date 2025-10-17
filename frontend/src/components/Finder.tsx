// src/App.tsx
import React, { useState, useMemo, useEffect, ChangeEvent, FormEvent } from 'react';
import "./Finder.css"
import basesData from '../data/bases.json';

interface Constraint {
  id: number;
  measure: 'media' | 'desviacion';
  operator: string;
  value: string;
}

interface DynamicFilter {
  id: number;
  characteristic: string;
  constraints: Constraint[];
}


interface CharacteristicGroup {
  category: string;
  items: string[];
}

const CHARACTERISTIC_GROUPS: CharacteristicGroup[] = [
  {
    category: 'EmotionalDimension',
    items: ['Dominance', 'Arousal', 'Valence', 'Prototipicality', 'Interoception', 'Feeling', 'Evaluation']
  },
  {
    category: 'DiscreteEmotionalCategory',
    items: ['Disgust', 'Sadness', 'Happiness', 'Anger', 'Fear', 'Awe', 'Relief', 'Amusement', 'Excitement', 'Pleasure', 'Contentment', 'Serenity']
  },
  {
    category: 'RecognitionTime',
    items: ['TimeTDL', 'TimeNaming', 'RecognitionTimePercentage']
  },
  {
    category: 'SubjectiveDimension',
    items: ['AcquisitionAge', 'SensoryExperience', 'Concreteness', 'Imageability', 'ContextualAvailability', 'Familiarity', 'Iconicity', 'Thought', 'SocialInteraction', 'BodyExpression', 'Morality', 'Action']
  },
  {
    category: 'ObjectiveEstimation',
    items: ['ObjectiveAcquisitionAge']
  }
  // Agrega o ajusta categorías según tu ontología
];

const RECOGNITION_TIME_ITEMS = CHARACTERISTIC_GROUPS.find(group => group.category === 'RecognitionTime')?.items || [];


function Finder() {
  // Text filters state
  const [matchType, setMatchType] = useState<'startsWith' | 'endsWith' | 'contains' | 'exact'>('startsWith');
  const [searchText, setSearchText] = useState('');
  const [sparqlResult, setSparqlResult] = useState<any>(null);

  // Helper to download SPARQL results as CSV
  const downloadCsv = () => {
    if (!sparqlResult?.head?.vars || !sparqlResult?.results?.bindings) return;
    const headers = sparqlResult.head.vars;
    const rows = sparqlResult.results.bindings.map((row: any) =>
      headers.map((h: string) => row[h]?.value ?? '')
    );
    const csvContent =
      [headers, ...rows]
        .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Dynamic characteristic filters state
  const [dynamicFilters, setDynamicFilters] = useState<DynamicFilter[]>([
    { id: 1, characteristic: '', constraints: [{ id: 1, measure: 'media', operator: '', value: '' }] },
  ]);

  // Bases state
  const [selectedBases, setSelectedBases] = useState<string[]>([]);

  const [hiddenFilters, setHiddenFilters] = useState<number[]>([]);

  // State for displaying validation messages on constraint values
  const [valueErrors, setValueErrors] = useState<Record<string, string>>({});

  // Modal state for base info
  const [infoModal, setInfoModal] = useState<string | null>(null);

  const toggleHideFilter = (id: number) => {
    setHiddenFilters(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  // Handlers for text filters
  const handleSearchTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  const handleMatchTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setMatchType(e.target.value as 'startsWith' | 'endsWith' | 'contains' | 'exact');
  };

  // Handlers for dynamic filters
  const addFilter = () => {
    const newId = dynamicFilters.length > 0 ? Math.max(...dynamicFilters.map(f => f.id)) + 1 : 1;
    setDynamicFilters([
      ...dynamicFilters,
      { id: newId, characteristic: '', constraints: [{ id: 1, measure: 'media', operator: '', value: '' }] },
    ]);
  };

  const removeFilter = (id: number) => {
    setDynamicFilters(dynamicFilters.filter(f => f.id !== id));
  };

  const updateFilterField = (id: number, field: 'characteristic', value: string) => {
    setDynamicFilters(prev =>
      prev.map(f => {
        if (f.id !== id) return f;
        // Reset each constraint's measure to first metric of new characteristic
        const varInfo = availableVariables.find(v => v.variable_class === value);
        const defaultMetric = varInfo?.metrics?.[0]?.metric || '';
        return {
          ...f,
          characteristic: value,
          constraints: f.constraints.map(c => ({ ...c, measure: defaultMetric }))
        };
      })
    );
  };

  const updateConstraintField = (
    filterId: number,
    constraintId: number,
    field: keyof Omit<Constraint, 'id'>,
    value: string
  ) => {
    setDynamicFilters(prev =>
      prev.map(f => {
        if (f.id !== filterId) return f;
        return {
          ...f,
          constraints: f.constraints.map(c =>
            c.id === constraintId ? { ...c, [field]: value } : c
          ),
        };
      })
    );
  };

  const addConstraint = (filterId: number) => {
    setDynamicFilters(prev =>
      prev.map(f => {
        if (f.id !== filterId) return f;
        const newId = f.constraints.length > 0 ? Math.max(...f.constraints.map(c => c.id)) + 1 : 1;
        return {
          ...f,
          constraints: [
            ...f.constraints,
            // Default to first metric of selected characteristic, or empty
            (() => {
              const varInfo = availableVariables.find(v => v.variable_class === f.characteristic);
              const defaultMetric = varInfo?.metrics?.[0]?.metric || '';
              return { id: newId, measure: defaultMetric, operator: '', value: '' };
            })(),
          ],
        };
      })
    );
  };

  const removeConstraint = (filterId: number, constraintId: number) => {
    setDynamicFilters(prev =>
      prev.map(f => {
        if (f.id !== filterId) return f;
        return {
          ...f,
          constraints: f.constraints.filter(c => c.id !== constraintId),
        };
      })
    );
  };

  // Handlers for bases and method
  const toggleBase = (base: string) => {
    setSelectedBases(prev => {
      if (prev.includes(base)) {
        return prev.filter(b => b !== base);
      } else {
        return [...prev, base];
      }
    });
  };

  const selectAllBases = () => {
    const allIds = (basesData as { id: string }[]).map(b => b.id);
    if (selectedBases.length === allIds.length) {
      setSelectedBases([]);
    } else {
      setSelectedBases(allIds);
    }
  };

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Compute available variables from selected bases, deduplicated by variable_label
  const availableVariables = useMemo(() => {
    const varsList: any[] = [];
    const seenLabels = new Set<string>();
    (basesData as any[])
      .filter(b => selectedBases.includes(b.id))
      .forEach(b => {
        (b.variables || []).forEach((v: any) => {
          if (!seenLabels.has(v.variable_label)) {
            seenLabels.add(v.variable_label);
            varsList.push(v);
          }
        });
      });
    return varsList;
  }, [selectedBases]);

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Build the request payload with all filter data
    const selectedBaseObjects = (basesData as any[])
        .filter(b => selectedBases.includes(b.id))
        .map(b => ({ id: b.id, label: b.label }));
    const payload = {
      matchType,
      searchText,
      dynamicFilters,
      selectedBases: selectedBaseObjects,
    };

    try {
      const response = await fetch('http://localhost:3000/api/sparql-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error('Error en la petición:', response.statusText);
        return;
      }
      const result = await response.json();
      setSparqlResult(result);
      // TODO: manejar resultados en la interfaz
    } catch (error) {
      console.error('Error de conexión con el backend:', error);
    }
  };

  return (
    <div className="app-container">
      <form onSubmit={handleSubmit} className="form-container">
        <div className="card filter-card">
          <h2 className="section-title">Filtros de búsqueda</h2>
          <div className="search-row">
            <div className="search-row-inner">
              <div className="field-group type-group">
                <label className="label">Tipo de búsqueda:</label>
                <select value={matchType} onChange={handleMatchTypeChange} className="input">
                  <option value="startsWith">Empieza por</option>
                  <option value="endsWith">Termina en</option>
                  <option value="contains">Contiene</option>
                  <option value="exact">Palabra exacta</option>
                </select>
              </div>
              <div className="field-group text-group">
                <label className="label">Texto a buscar:</label>
                <input
                  type="text"
                  value={searchText}
                  onChange={handleSearchTextChange}
                  className="input"
                  placeholder={
                    matchType === 'startsWith'
                      ? 'Ingresa texto inicial'
                      : matchType === 'endsWith'
                      ? 'Ingresa texto final'
                      : matchType === 'contains'
                      ? 'Ingresa texto intermedio'
                      : 'Ingresa texto exacto'
                  }
                />
              </div>
            </div>
          </div>

          {dynamicFilters.map((filter) =>
            hiddenFilters.includes(filter.id) ? (
              <div key={filter.id} className="hidden-filter">
                <span>
                  Filtro {filter.id}
                  {filter.characteristic && (() => {
                    const varObj = availableVariables.find(v => v.variable === filter.characteristic);
                    return varObj ? ` (${varObj.variable_label})` : '';
                  })()}
                </span>
                <button
                  type="button"
                  onClick={() => toggleHideFilter(filter.id)}
                  className="filter-buttons hide-filter"
                >
                  Mostrar
                </button>
              </div>
            ) : (
              <div key={filter.id} className="expanded-filter">
                <div className="filter-header">
                  <strong>Filtro {filter.id}</strong>
                  <div className="filter-buttons">
                    <button
                      type="button"
                      onClick={() => removeFilter(filter.id)}
                      className="remove-filter"
                    >
                      Eliminar filtro
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleHideFilter(filter.id)}
                      className="hide-filter"
                    >
                      Ocultar
                    </button>
                  </div>
                </div>

                <div className="characteristic-group">
                  <label className="label">Característica:</label>
                  <select
                    value={filter.characteristic}
                    onChange={(e) => updateFilterField(filter.id, 'characteristic', e.target.value)}
                    className="input characteristic-select"
                  >
                    <option value="">Seleccionar</option>
                    {availableVariables.map(v => (
                      <option key={v.variable_class} value={v.variable_class}>
                        {v.variable_label}
                      </option>
                    ))}
                  </select>
                </div>

                {filter.constraints.map((constraint) => (
                  <div key={constraint.id} className="constraint-row">
                    <div className="constraint-field">
                      <label className="label">Medida:</label>
                      {RECOGNITION_TIME_ITEMS.includes(filter.characteristic.replace('emolex:', '')) ? (
                        <select disabled value="recognitionTime" className="input disabled-select">
                          <option value="recognitionTime">Recognition Time</option>
                        </select>
                      ) : (
                        (() => {
                          const varInfo = availableVariables.find(v => v.variable_class === filter.characteristic);
                          return (
                            <select
                              value={constraint.measure}
                              onChange={(e) =>
                                updateConstraintField(filter.id, constraint.id, 'measure', e.target.value)
                              }
                              className="input"
                            >
                              <option value="">Seleccionar</option>
                              {varInfo?.metrics.map((m: any) => (
                                <option key={m.metric} value={m.metric}>
                                  {m.metric_label}
                                </option>
                              ))}
                            </select>
                          );
                        })()
                      )}
                    </div>
                    <div className="constraint-field">
                      <label className="label">Operador:</label>
                      <select
                        value={constraint.operator}
                        onChange={(e) =>
                          updateConstraintField(filter.id, constraint.id, 'operator', e.target.value)
                        }
                        className="input"
                      >
                        <option value="">Seleccionar</option>
                        <option value=">">&gt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<">&lt;</option>
                        <option value="<=">&lt;=</option>
                        <option value="=">=</option>
                      </select>
                    </div>
                    <div className="constraint-field value-field">
                      <label className="label">Valor:</label>
                      {(() => {
                        const varInfo = availableVariables.find(v => v.variable_class === filter.characteristic);
                        // Nuevo handleBlur que recibe el evento
                        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
                          const input = e.target;
                          if (varInfo) {
                            const metricObj = varInfo.metrics.find((m: any) => m.metric === constraint.measure);
                            const min = metricObj?.min;
                            const max = metricObj?.max;
                            const num = parseFloat(input.value);
                            if (!isNaN(num)) {
                              let clamped = num;
                              if (max !== undefined && num > max) clamped = max;
                              if (min !== undefined && num < min) clamped = min;
                              if (clamped !== num) {
                                updateConstraintField(filter.id, constraint.id, 'value', clamped.toString());
                              }
                              if (num > (max ?? Infinity)) {
                                input.setCustomValidity(`El valor debe ser ≤ ${max}`);
                              } else if (num < (min ?? -Infinity)) {
                                input.setCustomValidity(`El valor debe ser ≥ ${min}`);
                              } else {
                                input.setCustomValidity('');
                              }
                              input.reportValidity();
                            }
                          }
                        };
                        return (
                          <div className="input-wrapper">
                            <input
                              type="number"
                              step="any"
                              value={constraint.value}
                              onChange={e => updateConstraintField(filter.id, constraint.id, 'value', e.target.value)}
                              onBlur={handleBlur}
                              className="input"
                              placeholder="Valor"
                              {...(varInfo
                                ? {
                                    min: varInfo.metrics.find((m: any) => m.metric === constraint.measure)?.min,
                                    max: varInfo.metrics.find((m: any) => m.metric === constraint.measure)?.max,
                                  }
                                : {})}
                            />
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeConstraint(filter.id, constraint.id)}
                      className="remove-constraint-button"
                    >
                      -
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => addConstraint(filter.id)} className="circle-button">
                  +
                </button>
              </div>
            )
          )}

          <button type="button" onClick={addFilter} className="circle-button">
            +
          </button>

          <button type="submit" className="button-primary">
            Buscar
          </button>
        </div>

        <div className="base-card-container">
          <div className="base-card-header">
            <h2 className="section-title">Bases de palabras</h2>
            <button type="button" onClick={selectAllBases} className="select-all-button">
              {selectedBases.length === ((basesData as { id: string }[]).length) ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>
          </div>
          <div className="base-list-container">
            {(basesData as { id: string; label: string }[]).map((b) => (
              <div key={b.id} className="base-item">
                <label className="label base-label">
                  <input
                    type="checkbox"
                    checked={selectedBases.includes(b.id)}
                    onChange={() => toggleBase(b.id)}
                    className="base-checkbox"
                  />
                  {b.label}
                </label>
                <button type="button" onClick={() => setInfoModal(b.id)} className="info-button">
                  i
                </button>
              </div>
            ))}
          </div>
        </div>
      </form>

      {sparqlResult?.head && sparqlResult?.results && (() => {
        // Filtrar columnas: quitar "annotation" y "lexicon"
        const allVars: string[] = sparqlResult.head.vars;
        const filteredVars = allVars.filter(v => v !== "annotation" && v !== "lexicon");
        return (
          <div className="results-table-container">
            <div className="results-header">
              <h2 className="section-title">Resultados</h2>
              <button
                type="button"
                onClick={downloadCsv}
                className="download-button"
              >
                Descargar CSV
              </button>
            </div>
            <table className="results-table">
              <thead>
                <tr>
                  {filteredVars.map((v: string) => (
                    <th key={v}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sparqlResult.results.bindings.map((row: any, idx: number) => (
                  <tr key={idx}>
                    {filteredVars.map((v: string) => {
                      // Palabra: enlace a annotation
                      if (v === "palabra") {
                        const palabraVal = row["palabra"]?.value || "";
                        const annotationVal = row["annotation"]?.value;
                        return (
                          <td key={v}>
                            {annotationVal ? (
                              <a href={annotationVal} target="_blank" rel="noopener noreferrer">{palabraVal}</a>
                            ) : palabraVal}
                          </td>
                        );
                      }
                      // Base: enlace a lexicon
                      if (v === "base") {
                        const baseVal = row["base"]?.value || "";
                        const lexiconVal = row["lexicon"]?.value;
                        return (
                          <td key={v}>
                            {lexiconVal ? (
                              <a href={lexiconVal} target="_blank" rel="noopener noreferrer">{baseVal}</a>
                            ) : baseVal}
                          </td>
                        );
                      }
                      // Otros: valor directo
                      return (
                        <td key={v}>{row[v]?.value || ''}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {infoModal && (
        <div className="modal-overlay" onClick={() => setInfoModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Retrieve the base object */}
            {(() => {
              const base = (basesData as { id: string; label: string; ref: string; url: string; words: number }[])
                .find(b => b.id === infoModal);
              if (!base) return null;
              return (
                <>
                  <h3 className="modal-title">{base.label}</h3>
                  <p className="modal-text"><strong>Reference:</strong> {base.ref}</p>
                  <p className="modal-text"><strong>Words:</strong> {base.words}</p>
                  <p className="modal-text">
                    <strong>URL:</strong>{' '}
                    <a href={base.url} target="_blank" rel="noopener noreferrer">
                      {base.url}
                    </a>
                  </p>
                  <button
                    type="button"
                    onClick={() => setInfoModal(null)}
                    className="button-primary"
                  >
                    Cerrar
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default Finder;