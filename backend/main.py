# main.py
from fastapi import FastAPI, HTTPException, UploadFile, Form, File, Request
from fastapi import Body
from pydantic import BaseModel
from typing import List, Any
import httpx
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import base64

# Carga variables de entorno desde .env
load_dotenv("./.env")
GITHUB_OWNER = os.getenv("GITHUB_OWNER")
GITHUB_REPO = os.getenv("GITHUB_REPO")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

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

class SearchRequest(BaseModel):
    matchType: str
    searchText: str
    dynamicFilters: List[DynamicFilter]
    selectedBases: List[Bases]

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

# Para ejecutar: uvicorn main:app --reload --port 3000


# Helper to build SPARQL query from SearchRequest
def build_sparql(search: SearchRequest) -> str:
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
            var = f"?{df.characteristic.replace('emolex:','').lower()}"
            where.append(f"  ?annotation {c.measure} {var} .")
            where.append(f"  FILTER({var} {c.operator} {c.value})")
            vars.append(f"{var}")
        where.append(f"}} UNION")

    where_block = "\n".join(where)[:-6]
    projection = "SELECT DISTINCT ?palabra ?base ?annotation ?lexicon " + " ".join(vars)
    query = f"""{PREFIXES}
            {projection}
            WHERE {{
                    {where_block}
            }}"""
    return query

@app.post("/api/sparql-query")
async def sparql_query(search: SearchRequest):
    # Build the SPARQL query using helper
    query_str = build_sparql(search)
    print(query_str)
    # Execute against GraphDB
    sparql_url = "https://kg.app.citius.gal/data/sparql/emofinder/query"
    headers = {
        "Content-Type": "application/sparql-query",
        "Accept": "application/sparql-results+json"
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(sparql_url, content=query_str.encode("utf-8"), headers=headers)
    if response.status_code >= 300:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()
