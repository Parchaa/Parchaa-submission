# CDSCO RegAI — Regulatory Workflow Automation

CDSCO RegAI is an advanced AI-powered platform designed to automate and streamline regulatory workflows for the Central Drugs Standard Control Organisation (CDSCO). It leverages state-of-the-art Large Language Models to process, analyze, and manage regulatory documents such as Clinical Trial Applications, New Drug Applications, and Serious Adverse Event (SAE) reports.

## 🚀 Features

The application offers multiple AI-driven capabilities:

1. **Document Classification & Extraction**: Automatically classifies uploaded documents and extracts critical metadata (e.g., application type, applicant details, risk level) using LLMs.
2. **Completeness Check**: Validates submission documents against CDSCO-specific regulatory checklists, identifying missing components, generating completeness scores, and highlighting critical gaps.
3. **Document Comparison**: Compares different versions of regulatory documents (e.g., original vs. revised protocols) and generates a structural diff highlighting regulatory impact.
4. **Intelligent Summarisation**: Generates concise, structured summaries of lengthy regulatory dossiers, extracting key findings, risks, and conclusions.
5. **PII Anonymisation**: Redacts Personally Identifiable Information (PII) from clinical trial documents or SAE reports to ensure data privacy and compliance.
6. **Inspection Report Generation**: Analyzes inspection notes and automatically drafts structured, compliant inspection reports ready for review.

## 🏗️ Architecture

The platform uses a modern decoupled architecture:

- **Frontend**: A React application built with Vite, providing a seamless and responsive user interface for document uploading, viewing analysis results, and managing workflows.
- **Backend API**: A high-performance RESTful API built with FastAPI (Python) that handles requests from the frontend, orchestrates file processing, and interfaces with the AI models.
- **AI Engine**: Python-based modules (`modules/`) integrating with an **Advanced LLM API** for natural language understanding, extraction, and generation.
- **Database**: PostgreSQL database used for persisting application state, metadata, and workflow history.
- **Storage**: AWS S3 integration for secure document storage and retrieval.
- **Alternative UI**: A built-in Streamlit application (`app.py`) for rapid prototyping and internal administrative use.

### Architectural Diagram

```mermaid
graph TD
    %% Frontend Layer
    subgraph Frontend [Presentation Layer]
        UI[React / Vite Web App]
        Streamlit[Streamlit App]
    end

    %% Backend API Layer
    subgraph Backend [Backend Services]
        FastAPI[FastAPI Application]
        Router[API Routers]
        FastAPI --> Router
    end

    %% Core Modules
    subgraph Core [AI Modules & Processing]
        Anonymizer[PII Anonymizer]
        Classifier[Document Classifier]
        Completeness[Completeness Checker]
        Summarizer[Dossier Summarizer]
        Comparator[Document Comparator]
        Inspector[Inspection Report Generator]
    end

    %% Infrastructure & External Services
    subgraph Infrastructure [Infrastructure & External APIs]
        DB[(PostgreSQL)]
        S3[(AWS S3 Storage)]
        LLM((Advanced LLM API))
    end

    %% Connections
    UI -->|REST API Calls| FastAPI
    Streamlit --> Core
    Router --> Core
    
    Core --> LLM
    Core --> DB
    Core --> S3
```

## 🔄 Logic Flow

1. **Document Upload**: Users upload documents (PDF, DOCX, TXT) via the React frontend. The file is sent to the FastAPI backend via the `/api/upload` endpoint.
2. **Text Extraction**: The backend extracts raw text from the uploaded document using built-in utilities or OCR if necessary.
3. **AI Processing**: Based on the requested workflow (e.g., completeness check), the backend routes the extracted text to the relevant core module (e.g., `completeness.py`).
4. **LLM Invocation**: The module constructs a tailored prompt combining the document text, CDSCO guidelines, and the specific task instructions, then invokes the LLM API.
5. **Structured Parsing**: The LLM returns a structured JSON response containing the analysis (e.g., missing checklist items, summaries, redacted text).
6. **Persistence & Storage**: Metadata and analysis results are saved to the PostgreSQL database, and files are optionally archived in AWS S3.
7. **Response to Client**: The FastAPI backend returns the structured result to the React frontend, which renders dynamic dashboards, diff views, and status badges.

## 📂 Project Structure

```text
cdsco_app/
├── backend/                  # FastAPI backend server
│   └── app/
│       ├── api/              # API Route handlers (upload, summarize, etc.)
│       ├── main.py           # FastAPI application entry point
│       └── schemas/          # Pydantic models for request/response validation
├── frontend/                 # React UI application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page-level components (CompletenessPage, etc.)
│   │   └── lib/api.js        # Axios API client for backend communication
│   ├── package.json
│   └── vite.config.js
├── modules/                  # Core AI business logic
│   ├── anonymizer.py         # PII redaction logic
│   ├── classifier.py         # Document classification logic
│   ├── completeness.py       # Regulatory completeness checking
│   ├── inspection_report.py  # Report generation
│   └── summarizer.py         # Text summarisation
├── config.py                 # Centralized configuration (Env vars, API keys)
├── database.py               # PostgreSQL connection and ORM setup
├── storage.py                # AWS S3 integration
├── app.py                    # Streamlit alternative UI
├── docker-compose.yml        # Container orchestration
└── requirements.txt          # Python dependencies
```

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- PostgreSQL Database
- LLM API Key

### 1. Environment Configuration
Create a `.env` file in the root directory (use `.env.example` as a template):
```env
API_KEY=your_api_key
MODEL_NAME=your_model_name
DATABASE_URL=postgresql://user:password@localhost:5432/cdsco_regai
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=ap-south-1
S3_BUCKET=your_s3_bucket
```

### 2. Backend Setup
Create a virtual environment and install dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
```

Run the FastAPI server:
```bash
uvicorn backend.app.main:app --reload --port 8000
```

*Alternatively, run the Streamlit app:*
```bash
streamlit run app.py
```

### 3. Frontend Setup
Navigate to the frontend directory, install packages, and start the Vite development server:
```bash
cd frontend
npm install
npm run dev
```

The React frontend will run on `http://localhost:5173` and automatically proxy API requests to the FastAPI backend.

## 🐳 Docker Deployment

To spin up the entire stack using Docker Compose:

```bash
docker-compose up --build -d
```
This will start the FastAPI backend, the React frontend, and a PostgreSQL instance based on the configurations in `docker-compose.yml`.
