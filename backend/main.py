# main.py
from fastapi import FastAPI, HTTPException, UploadFile, Form, File, Request
from fastapi import Body
from pydantic import BaseModel
from typing import List, Any
import httpx
import os, re
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from collections import defaultdict

# Carga variables de entorno desde .env
load_dotenv("./.env")
GITHUB_OWNER = os.getenv("GITHUB_OWNER")
GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
SPARQL_ENDPOINT = os.getenv("SPARQL_ENDPOINT")

if not GITHUB_OWNER or not GITHUB_REPO or not GITHUB_TOKEN:
    raise RuntimeError("Faltan variables de entorno: GITHUB_OWNER, GITHUB_REPO o GITHUB_TOKEN")

app = FastAPI()
# Configure CORS to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SearchRequest Model for SPARQL Query ---
class Constraint(BaseModel):
    id: int
    measure: str
    operator: str
    value: Any
class Bases(BaseModel):
    id: str
    label: str

class DynamicFilter(BaseModel):
    id: int
    characteristic: str
    constraints: List[Constraint]

class Options(BaseModel):
    criteriaScope: str
    groupByBase: bool
    includeUris: bool

class SearchRequest(BaseModel):
    matchType: str
    searchText: str
    dynamicFilters: List[DynamicFilter]
    selectedBases: List[Bases]
    options: Options

class IssueRequest(BaseModel):
    title: str
    body: str
    labels: list[str] = []
    assignees: list[str] = []

class IssueResponse(BaseModel):
    url: str

@app.post("/api/create-issue", response_model=IssueResponse)
async def create_issue(
    request: Request,
    contactName: str = Form(...),
    contactEmail: str = Form(...),
    fileName: str = Form(...),
    paper: str = Form(...),
    url: str = Form(...),
    words: int = Form(...),
    datasetFile: UploadFile = File(...)
):
    gh_url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/issues"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    contents = await datasetFile.read()

    form = await request.form()
    chars = []
    idx = 0
    while f"characteristics[{idx}].name" in form:
        name = form[f"characteristics[{idx}].name"]
        minv = form.get(f"characteristics[{idx}].min", "")
        maxv = form.get(f"characteristics[{idx}].max", "")
        chars.append(f"- {name}: min={minv or 'N/A'}, max={maxv or 'N/A'}")
        idx += 1
    # Upload dataset file as a private Gist and get its URL
    gist_url = None
    try:
        gist_payload = {
            "description": f"Dataset file for {fileName}",
            "public": False,
            "files": {
                datasetFile.filename: {"content": contents.decode('utf-8')}
            }
        }
        async with httpx.AsyncClient() as gist_client:
            gist_resp = await gist_client.post(
                "https://api.github.com/gists",
                headers=headers,
                json=gist_payload
            )
        if gist_resp.status_code < 300:
            gist_url = gist_resp.json().get("html_url")
    except Exception:
        gist_url = None
    issue_body = (
        f"**Responsable:** {contactName} ({contactEmail})\n"
        f"**Dataset:** {fileName}\n"
        f"**Paper:** {paper}\n"
        f"**URL:** {url}\n"
        f"**Número de palabras:** {words}\n\n"
        + (f"[Descargar archivo]({gist_url})\n" if gist_url else "")
    )
    payload = {
        "title": f"New dataset: {fileName}",
        "body": issue_body,
        "labels": ["dataset"],
        "assignees": []
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(gh_url, headers=headers, json=payload)
    if response.status_code >= 300:
        detail = response.json()
        raise HTTPException(status_code=response.status_code, detail=detail)
    data = response.json()
    return IssueResponse(url=data.get("html_url"))

def build_sparql_all(search: SearchRequest) -> str:
    PREFIXES = """
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX emolex: <https://w3id.org/def/emolex#>
        PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX lime: <http://www.w3.org/ns/lemon/lime#>
        PREFIX rb: <https://w3id.org/riverbench/schema/metadata#>
        PREFIX dcterms: <http://purl.org/dc/terms/>
        """
    BASE_TRIPLES = f"""
        ?lexical_entry1 rdf:type ontolex:LexicalEntry .
        ?lexical_entry1 ontolex:lexicalForm ?lexical_form1 .

        ?lexical_form1 ontolex:writenRep ?palabra .

        ?lexicon1 rdf:type lime:Lexicon .
        ?lexicon1 rdfs:label ?base_label .
        ?lexicon1 lime:entry ?lexical_entry1 .

        ?annotation1 rdf:type emolex:Annotation .
        ?annotation1 emolex:affects ?lexical_entry1 .
        ?annotation1 dcterms:source ?lexicon1 .

        BIND("BASE_LABEL" AS ?base1) 
        """

    where = []
    annotations = []
    vars = []
    where_block = []
    # Filter by selectedBases in same graph via label_base

    for i, b in enumerate(search.selectedBases, start=1):
        base = b.label
        text = BASE_TRIPLES.replace("?base_label", f"\"{base}\"")
        text = text.replace("BASE_LABEL", f"{base}")
        text = text.replace("1", str(i))
        where.append(text)

        annotations.append(f"?annotation{i}")
    # Text matching
        if search.searchText:
            op_map = {
                'startsWith': 'STRSTARTS',
                'endsWith': 'STRENDS',
                'contains': 'CONTAINS',
                'exact': None
            }
            func = op_map.get(search.matchType)
            if func:
                where.append(
                    f'  FILTER({func}( LCASE(STR(?palabra)), LCASE("{search.searchText}") ))'
                )
            else:
                where.append(
                    f'  FILTER( LCASE(STR(?palabra)) = LCASE("{search.searchText}") )'
                )

    # Dynamic filters on annotations

        for df in search.dynamicFilters:
            # Ensure annotation is of the correct class
            where.append(f"{{ ?annotation{i} rdf:type {df.characteristic} .")
            for c in df.constraints:
                var = f"?{re.sub(r'(?<!^)(?=[A-Z])', '_', df.characteristic.replace('emolex:', '')).lower()}_{c.measure.split(':', 1)[-1]}"
                where.append(f"  ?annotation{i} {c.measure} {var}{i} .")
                where.append(f"  FILTER({var}{i} {c.operator} {c.value})")
                vars.append(f"{var}{i}")
            where.append(f"}} UNION")
        if search.dynamicFilters:
            where[-1] = where[-1][:-6]
        #where_block.append("\n".join(where)[:-6])
    where_block = "\n".join(where)
    bases = list(map(lambda x: x.replace("annotation","base"), annotations))
    if search.options.includeUris:
        projection = f'SELECT DISTINCT ?palabra {" ".join(annotations)} {" ".join(bases)} {" ".join(vars)}'
    else:
        projection = f'SELECT DISTINCT ?palabra  {" ".join(vars)}'
    query = f"""{PREFIXES}
                {projection}
                WHERE {{
                        {where_block}
                }} ORDER BY ?palabra"""
    return query


# Helper to build SPARQL query from SearchRequest
def build_sparql_any(search: SearchRequest) -> str:
    PREFIXES = """
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX emolex: <https://w3id.org/def/emolex#>
    PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX lime: <http://www.w3.org/ns/lemon/lime#>
    PREFIX rb: <https://w3id.org/riverbench/schema/metadata#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    """
    BASE_TRIPLES = """
    ?lexical_entry rdf:type ontolex:LexicalEntry .
    ?lexical_entry ontolex:lexicalForm ?lexical_form .
    
    ?lexical_form ontolex:writenRep ?palabra .
    
    ?lexicon rdf:type lime:Lexicon .
    ?lexicon rdfs:label ?base .
    ?lexicon lime:entry ?lexical_entry .
    
    ?annotation rdf:type emolex:Annotation .
    ?annotation emolex:affects ?lexical_entry .
    ?annotation dcterms:source ?lexicon .
    
    
    """

    where = [BASE_TRIPLES]

    # Filter by selectedBases in same graph via label_base
    if search.selectedBases:
        labels = ", ".join(f"\"{b.label}\"" for b in search.selectedBases)
        where.append(f"  FILTER(?base IN ({labels}))")

    # Text matching
    if search.searchText:
        op_map = {
            'startsWith': 'STRSTARTS',
            'endsWith': 'STRENDS',
            'contains': 'CONTAINS',
            'exact': None
        }
        func = op_map.get(search.matchType)
        if func:
            where.append(
                f'  FILTER({func}( LCASE(STR(?palabra)), LCASE("{search.searchText}") ))'
            )
        else:
            where.append(
                f'  FILTER( LCASE(STR(?palabra)) = LCASE("{search.searchText}") )'
            )

    # Dynamic filters on annotations
    vars = []
    for df in search.dynamicFilters:
        # Ensure annotation is of the correct class

        where.append(f"{{ ?annotation rdf:type {df.characteristic} .")
        for c in df.constraints:
            var = f"?{re.sub(r'(?<!^)(?=[A-Z])', '_', df.characteristic.replace('emolex:', '')).lower()}_{c.measure.split(':', 1)[-1]}"
            where.append(f"  ?annotation {c.measure} {var} .")
            where.append(f"  FILTER({var} {c.operator} {c.value})")
            vars.append(f"{var}")
        where.append(f"}} UNION")
    if search.dynamicFilters:
        where_block = "\n".join(where)[:-6]
    else:
        where_block = "\n".join(where)
    if search.options.includeUris:
        projection = f'SELECT DISTINCT ?palabra ?base ?annotation ?lexicon {" ".join(vars)}'
    else:
        projection = f'SELECT DISTINCT ?palabra ?base  {" ".join(vars)}'
    query = f"""{PREFIXES}
            {projection}
            WHERE {{
                    {where_block}
            }} ORDER BY ?palabra"""
    return query

def combine_words(sparql_json):
    rows = sparql_json["results"]["bindings"]

    # Agrupar por palabra
    grouped = defaultdict(list)
    for row in rows:
        palabra = row["palabra"]["value"]
        grouped[palabra].append(row)

    pivoted_bindings = []
    all_vars = ["palabra"]  # 🔹 empezamos con 'palabra' fijo en primer lugar

    for palabra, values in grouped.items():
        entry = {
            "palabra": {"type": "literal", "value": palabra}
        }

        for v in values:
            base = v["base"]["value"]

            # dinámicamente añadir las métricas y annotations por base
            for k, val in v.items():
                if k in ("palabra", "base"):
                    continue
                metric_key = f"{base}_{k}"

                # si es una nueva variable, la añadimos al final de la lista de cabecera
                if metric_key not in all_vars:
                    all_vars.append(metric_key)

                entry[metric_key] = val

        pivoted_bindings.append(entry)

    # Construir resultado final en formato SPARQL JSON
    pivoted_result = {
        "head": {"vars": all_vars},  # 🔹 mantiene 'palabra' en primer lugar
        "results": {"bindings": pivoted_bindings}
    }

    return pivoted_result

def clean_results_join_words(sparql_json):
    """
    Dado un resultado SPARQL JSON con columnas base1, base2, ...
    renombra las columnas usando el nombre literal de la base
    (por ejemplo base1 = 'Redondo 2005' => arousal_mean1 -> Redondo 2005_arousal_mean)
    y elimina las columnas baseN del resultado.
    """
    head_vars = sparql_json["head"]["vars"]
    bindings = sparql_json["results"]["bindings"]

    # Detectar las bases (p. ej. base1, base2, ...) y construir un mapa índice -> nombre
    base_map = {}
    for var in head_vars:
        if var.startswith("base"):
            idx = re.sub(r"\D", "", var)  # extrae el número
            if idx:
                for row in bindings:
                    if var in row:
                        base_map[idx] = row[var]["value"]
                        break

    # Crear nuevos bindings y variables renombradas
    new_bindings = []
    new_head_vars = []

    for row in bindings:
        new_row = {}
        for var, val in row.items():
            # Saltar las columnas baseN (ya las usamos para renombrar)
            if var.startswith("base"):
                continue

            # Buscar si el nombre acaba en un número (annotation1, arousal_mean2, etc.)
            match = re.match(r"(.+?)(\d+)$", var)
            if match:
                base_idx = match.group(2)
                base_name = base_map.get(base_idx)
                if base_name:
                    new_var = f"{base_name}_{match.group(1)}"
                else:
                    new_var = var
            else:
                new_var = var

            new_row[new_var] = val
            if new_var not in new_head_vars:
                new_head_vars.append(new_var)

        new_bindings.append(new_row)

    # Asegurar que 'palabra' va primero
    if "palabra" in new_head_vars:
        new_head_vars = ["palabra"] + [v for v in new_head_vars if v != "palabra"]

    # Resultado final en formato SPARQL JSON
    return {
        "head": {"vars": new_head_vars},
        "results": {"bindings": new_bindings}
    }

@app.post("/api/sparql-query")
async def sparql_query(search: SearchRequest):
    # Build the SPARQL query using helper
    if search.options.criteriaScope == "all":
        query_str = build_sparql_all(search)
    else:
        query_str = build_sparql_any(search)

    print(query_str)
    # Execute against GraphDB
    sparql_url = SPARQL_ENDPOINT
    headers = {
        "Content-Type": "application/sparql-query",
        "Accept": "application/sparql-results+json"
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(sparql_url, content=query_str.encode("utf-8"), headers=headers)
    if response.status_code >= 300:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    data = response.json()
    if search.options.groupByBase and search.options.criteriaScope == "any":
        data = combine_words(data)
    elif search.options.criteriaScope == "all":
        data = clean_results_join_words(data)
    return data

# Para ejecutar: uvicorn main:app --reload --port 3000