"""
FastAPI routes for the AI Auditor pipeline.

Pipeline:
User upload/URL -> extraction -> normalization -> comparison -> risk scoring.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

from app.core.config import PROJECT_ROOT, get_openai_model, load_app_env
from app.models.schemas import DocumentSummary, RiskPayload, VerificationResponse
from app.services.comparison import (
    build_comparison_rows,
    compute_risk,
    summarize_rows,
)
from app.services.declaration_pipeline import process_shipment_documents
from app.services.extraction import (
    extract_structured_from_pdf,
    merge_canonical_documents,
    merge_standardized_documents,
)
from app.services.file_utils import (
    document_display_name,
    download_pdf_from_url,
    parse_declaration_json,
    parse_file_urls,
)

load_app_env()


def _parse_cors_origins() -> list[str]:
    raw = os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(
    title="Borderflow Verification API",
    version="0.2.0",
    description="Zero-Stop E-Border AI Auditor pipeline",
)

_cors_regex = os.environ.get("CORS_ORIGIN_REGEX", "").strip() or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "Borderflow Verification API",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/verify", response_model=VerificationResponse)
async def verify(
    declaration: str = Form(
        default="{}",
        description='JSON declaration: {"fields":[{"label":"HS Code","value":"84213920"}]}',
    ),
    file_urls: str = Form(
        default="[]",
        description="JSON string array of uploaded PDFs (e.g. Supabase URLs)",
    ),
    files: list[UploadFile] = File(default=[]),
) -> VerificationResponse:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=f"Missing OPENAI_API_KEY. Set it in {PROJECT_ROOT / '.env'}",
        )

    declaration_rows = parse_declaration_json(declaration)
    urls = parse_file_urls(file_urls)
    if not files and not urls:
        raise HTTPException(status_code=400, detail="Upload files or provide file_urls")

    model = get_openai_model()
    client = OpenAI(api_key=api_key)

    inputs: list[tuple[str, bytes, Literal["upload", "url"]]] = []
    for upload in files:
        if not upload.filename or not upload.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Not a PDF: {upload.filename}")
        content = await upload.read()
        if not content:
            raise HTTPException(status_code=400, detail=f"Empty file: {upload.filename}")
        inputs.append((upload.filename, content, "upload"))
    for url in urls:
        filename, content = download_pdf_from_url(url)
        inputs.append((filename, content, "url"))

    extracted_documents: list[dict[str, Any]] = []
    document_summaries: list[DocumentSummary] = []

    for filename, content, source in inputs:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            temp_path = Path(tmp.name)
        try:
            extracted = extract_structured_from_pdf(
                pdf_path=temp_path,
                client=client,
                model=model,
                filename_hint=Path(filename).stem,
            )
        finally:
            temp_path.unlink(missing_ok=True)

        extracted_documents.append(extracted)
        has_values = any(
            v if not isinstance(v, list) else len(v) > 0
            for v in extracted["canonical_json"].values()
        )
        document_summaries.append(
            DocumentSummary(
                id=str(uuid.uuid4()),
                name=document_display_name(extracted["inferred_document_type"], filename),
                page=f"Page 1 of {max(int(extracted['pages']), 1)}",
                status="valid" if has_values else "warning",
                document_type_hint=extracted["inferred_document_type"],
                extract_source="extract_to_json",
                source=source,
            )
        )

    normalized_merged = merge_canonical_documents(extracted_documents)
    standardized_json = merge_standardized_documents(extracted_documents)

    comparison_rows = build_comparison_rows(declaration_rows, normalized_merged)
    valid_fields, warnings, fraud_risks, overall = summarize_rows(comparison_rows)
    risk = compute_risk(comparison_rows)

    final_status: Literal["GREEN", "RED"] = "GREEN" if risk["status"] == "GREEN" else "RED"
    verification_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    return VerificationResponse(
        verification_id=verification_id,
        status=final_status,
        risk=RiskPayload(
            status=risk["status"],
            score=risk["score"],
            flags=risk["flags"],
            explanation=risk["explanation"],
        ),
        flags=risk["flags"],
        details={
            "raw_json": {
                doc["source_file"]: doc["raw_json"] for doc in extracted_documents
            },
            "standardized_json": standardized_json,
            "flow": "User Upload -> Extraction -> Normalize -> Compare -> Risk",
        },
        timestamp=now_iso,
        documents=document_summaries,
        comparison=comparison_rows,
        summary={
            "documents_scanned": len(document_summaries),
            "valid_fields": valid_fields,
            "warnings": warnings,
            "fraud_risks": fraud_risks,
        },
        normalized_merged=normalized_merged,
        standardized_json=standardized_json,
        overall_flag=overall,
    )


class ProcessShipmentDocumentsBody(BaseModel):
    shipment_id: str = Field(..., min_length=1, description="Saved shipments.id")


@app.post("/api/declaration/process-documents")
def declaration_process_documents(body: ProcessShipmentDocumentsBody) -> dict[str, Any]:
    """Load PDFs from Supabase Storage by documents.file_url; extract when needed; update mismatch_fields."""
    sid = body.shipment_id.strip()
    return process_shipment_documents(sid)
