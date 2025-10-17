// src/Sparql.tsx
import React, { useEffect, useRef } from 'react';
import YASGUI from '@triply/yasgui';
import '@triply/yasgui/build/yasgui.min.css';



const SPARQL_ENDPOINT = 'https://kg.app.citius.gal/data/sparql/emofinder/query';

const DEFAULT_QUERY = `
PREFIX emolex: <https://w3id.org/def/emolex#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX lime: <http://www.w3.org/ns/lemon/lime#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>

SELECT * WHERE {

    ?lexicon rdf:type lime:Lexicon .
    ?lexicon rdfs:label ?base .
    ?lexicon lime:entry ?lexical_entry .
    
    ?annotation rdf:type emolex:Annotation .
    ?annotation emolex:affects ?lexical_entry .
    ?annotation dcterms:source ?lexicon 
} LIMIT 100
`.trim();

const Sparql: React.FC = () => {
  const yasguiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!yasguiRef.current) return;

    const yasgui = new YASGUI(yasguiRef.current, {
      requestConfig: {
        endpoint: SPARQL_ENDPOINT,
        method: 'POST',
      },
    });

    // Preload the default query
    yasgui.getTab().setQuery(DEFAULT_QUERY);

    return () => {
      yasgui.destroy();
    };
  }, []);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '16px' }}>
      <div
        ref={yasguiRef}
        style={{
          width: '100%',
          height: '500px',
          border: '1px solid #ccc',
          marginTop: '12px',
        }}
      />
    </div>
  );
};

export default Sparql;
