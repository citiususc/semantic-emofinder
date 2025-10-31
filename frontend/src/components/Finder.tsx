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
  const [matchType, setMatchType] = useState<'startsWith' | 'endsWith' | 'contains' | 'exact' | 'words'>('startsWith');
  const [searchText, setSearchText] = useState('');
  const [sparqlResult, setSparqlResult] = useState<any>(null);

  const [optionsModal, setOptionsModal] = useState(false);
  const [includeUris, setIncludeUris] = useState(false);
  const [groupByBase, setGroupByBase] = useState(true);
  // Nuevo estado para el alcance de los criterios
  const [criteriaScope, setCriteriaScope] = useState<'all' | 'any'>('any');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

    const [sortColumn, setSortColumn] = useState<string | null>('palabra');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Helper to download SPARQL results as CSV
  const downloadCsv = () => {
    if (!sparqlResult?.head?.vars || !sparqlResult?.results?.bindings) return;
    const headers = sparqlResult.head.vars;
    const rows = sparqlResult.results.bindings.map((row: any) =>
      headers.map((h: string) => row[h]?.value ?? '')
    );
    const csvContent =
      [headers, ...rows]
        .map(r => r.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
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
    setMatchType(e.target.value as 'startsWith' | 'endsWith' | 'contains' | 'exact' | 'words');
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

        // Construir los objetos de las bases seleccionadas
        const selectedBaseObjects = (basesData as any[])
            .filter(b => selectedBases.includes(b.id))
            .map(b => ({ id: b.id, label: b.label }));

        // 🔍 Enriquecer los filtros dinámicos con todas las métricas si no hay filtros definidos
        const enrichedFilters = dynamicFilters.map(filter => {
            const characteristic = filter.characteristic;
            const baseVars = (basesData as any[])
                .filter(b => selectedBases.includes(b.id))
                .flatMap(b => b.variables || []);
            const varInfo = baseVars.find(v => v.variable_class === characteristic);

            // Si no hay restricciones activas → añadir todas las métricas posibles
            const hasActiveConstraints = filter.constraints.some(
                c => c.operator && c.value !== ''
            );

            const constraints = hasActiveConstraints
                ? filter.constraints
                : (varInfo?.metrics || []).map((m: any, idx: number) => ({
                    id: idx + 1,
                    measure: m.metric,
                    operator: '',
                    value: ''
                }));

            return { ...filter, constraints };
        });

        const payload = {
            matchType,
            searchText,
            dynamicFilters: enrichedFilters,
            selectedBases: selectedBaseObjects,
            options: {
                criteriaScope,
                groupByBase,
                includeUris,
            },
        };

        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/sparql-query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                console.error('Error en la petición:', response.statusText);
                setError('Error al ejecutar la consulta. Inténtalo de nuevo más tarde.');
                return;
            }

            const result = await response.json();
            if (!result.results || result.results.bindings.length === 0) {
                setError('No se encontraron resultados para los filtros seleccionados.');
                setSparqlResult(null);
            } else {
                setSparqlResult(result);
            }
        } catch (error) {
            console.error('Error de conexión con el backend:', error);
            setError('Error de conexión con el servidor.');
        } finally {
            setIsLoading(false);
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
                  <option value="words">Lista Palabras</option>
                </select>
              </div>
              <div className="field-group text-group">
                <label className="label">Cadena/Palabra(s):</label>
                <input
                  type="text"
                  value={searchText}
                  onChange={handleSearchTextChange}
                  className="input"
                  placeholder={
                    matchType === 'startsWith'
                      ? 'Letras iniciales'
                      : matchType === 'endsWith'
                      ? 'Letras finales'
                      : matchType === 'contains'
                      ? 'Letras intermedias'
                      : matchType === 'words'
                      ? 'Palabras separadas por coma'
                      : 'Palabra'
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
                      {availableVariables.map(v => {
                          // Tomamos la primera métrica (normalmente "rb:mean") para mostrar su rango
                          const mainMetric = v.metrics?.[0];
                          const range =
                              mainMetric?.min !== undefined && mainMetric?.max !== undefined
                                  ? ` (${mainMetric.min}–${mainMetric.max})`
                                  : '';
                          return (
                              <option key={v.variable_class} value={v.variable_class}>
                                  {v.variable_label}{range}
                              </option>
                          );
                      })}
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

            <div className="button-group">
                {/* Botón principal de búsqueda */}
                <button
                    type="submit"
                    className="button-primary main-button"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <span className="spinner"></span> Buscando...
                        </>
                    ) : (
                        "Buscar"
                    )}
                </button>

                {/* Botón de opciones */}
                <button
                    type="button"
                    className="button-secondary options-button"
                    onClick={() => setOptionsModal(true)}
                >
                    Opciones
                </button>

                {/* Modal de opciones */}
                {optionsModal && (
                  <div className="modal-overlay" onClick={() => setOptionsModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                      <h3 className="modal-title">Opciones de búsqueda</h3>

                      {/* Primera sección: cumplimiento de criterios */}
                      <div className="modal-section">
                        <p><strong>En caso de que una variable esté en varias bases, cumplir su criterio de búsqueda:</strong></p>
                        <label>
                          <input
                            type="radio"
                            name="criteriaScope"
                            value="all"
                            checked={criteriaScope === 'all'}
                            onChange={() => setCriteriaScope('all')}
                          />{' '}
                          en todas las bases
                        </label>
                        <br />
                        <label>
                          <input
                            type="radio"
                            name="criteriaScope"
                            value="any"
                            checked={criteriaScope === 'any'}
                            onChange={() => setCriteriaScope('any')}
                          />{' '}
                          en al menos una base
                        </label>
                      </div>

                      {/* Segunda sección: opciones de resultados */}
                      <div className="modal-section" style={{ marginTop: '20px' }}>
                        <p><strong>En los resultados:</strong></p>
                        <label>
                          <input
                            type="checkbox"
                            checked={groupByBase}
                            onChange={() => setGroupByBase((prev) => !prev)}
                          />{' '}
                           Agrupar palabras
                        </label>
                        <br />
                        <label>
                          <input
                            type="checkbox"
                            checked={includeUris}
                            onChange={() => setIncludeUris((prev) => !prev)}
                          />{' '}
                          Añadir URIs a los resultados
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => setOptionsModal(false)}
                        className="button-primary"
                        style={{ marginTop: '20px' }}
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                )}
            </div>
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
    {error && (
        <div className="error-message">
            {error}
        </div>
    )}
      {sparqlResult?.head && sparqlResult?.results && (() => {
        // Filtrar columnas: quitar "annotation" y "lexicon"
        const allVars: string[] = sparqlResult.head.vars;
        const filteredVars = allVars.filter(v =>
              v !== "annotation" &&
              v !== "lexicon" &&
              !v.endsWith("_annotation") &&
              !v.endsWith("_lexicon")
          );
        return (
          <div className="results-section">
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
            <div className="results-table-container">
                <table className="results-table">
                    <thead>
                    <tr>
                        {filteredVars.map((v: string) => (
                            <th
                                key={v}
                                onClick={() => {
                                    if (sortColumn === v) {
                                        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
                                    } else {
                                        setSortColumn(v);
                                        setSortDirection('asc');
                                    }
                                }}
                                className={
                                    sortColumn === v
                                        ? sortDirection === 'asc'
                                            ? 'sorted-asc'
                                            : 'sorted-desc'
                                        : ''
                                }
                            >
                                {v}
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {(sortColumn
                            ? [...sparqlResult.results.bindings].sort((a: any, b: any) => {
                                const valA = a[sortColumn]?.value || '';
                                const valB = b[sortColumn]?.value || '';
                                const numA = parseFloat(valA);
                                const numB = parseFloat(valB);
                                if (!isNaN(numA) && !isNaN(numB)) {
                                    return sortDirection === 'asc' ? numA - numB : numB - numA;
                                }
                                return sortDirection === 'asc'
                                    ? valA.localeCompare(valB)
                                    : valB.localeCompare(valA);
                            })
                            : sparqlResult.results.bindings
                    ).map((row: any, idx: number) => {
                        const annotationVal = row["annotation"]?.value;
                        return (
                            <tr key={idx}>
                                {filteredVars.map((v: string) => {
                                    if (v === "palabra") {
                                        const palabraVal = row["palabra"]?.value || "";
                                        return <td key={v}>{palabraVal}</td>;
                                    }
                                    if (v === "base") {
                                        const baseVal = row["base"]?.value || "";
                                        const lexiconVal = row["lexicon"]?.value;
                                        return (
                                            <td key={v}>
                                                {lexiconVal ? (
                                                    <a href={lexiconVal} target="_blank" rel="noopener noreferrer">
                                                        {baseVal}
                                                    </a>
                                                ) : baseVal}
                                            </td>
                                        );
                                    }
                                    return (
                                        <td key={v}>
                                            {(() => {
                                                const cell = row[v];
                                                if (!cell) return '';
                                                const value = cell.value ?? '';
                                                let link: string | undefined;
                                                const firstUnderscore = v.indexOf('_');
                                                if (firstUnderscore > -1) {
                                                    const basePrefix = v.slice(0, firstUnderscore);
                                                    const annoKey = `${basePrefix}_annotation`;
                                                    link = row[annoKey]?.value;
                                                }
                                                if (!link && row["annotation"]?.value) {
                                                    link = row["annotation"].value;
                                                }
                                                return link ? (
                                                    <a href={link} target="_blank" rel="noopener noreferrer">
                                                        {value}
                                                    </a>
                                                ) : (
                                                    value
                                                );
                                            })()}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
          </div>
        );
      })()}

      {infoModal && (
        <div className="modal-overlay" onClick={() => setInfoModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const base = (basesData as {
                id: string;
                label: string;
                ref: string;
                url: string;
                words: number;
                variables?: {
                  variable_class: string;
                  variable_label: string;
                  metrics?: {
                    metric: string;
                    metric_label: string;
                    min?: number;
                    max?: number;
                  }[];
                }[];
              }[]).find(b => b.id === infoModal);

              if (!base) return null;

              return (
                <>
                  <h3 className="modal-title">{base.label}</h3>
                  <p className="modal-text"><strong>Reference:</strong> {base.ref}</p>
                  <p className="modal-text"><strong>Words:</strong> {base.words}</p>
                    {base.variables && base.variables.length > 0 && (
                        <div className="modal-variables">
                            <p className="modal-text">
                                <strong>Variables:</strong>{' '}
                                {base.variables.map((v) => v.variable_label).join(', ')}
                            </p>
                        </div>
                    )}

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