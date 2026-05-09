# CDSCO RegAI — Regulatory Workflow Automation

🔗 **Live Demo Video**  
URL: [Google Drive Link](https://drive.google.com/file/d/1sDSLntKyjKVsFOEm6Q_wfQ0oEHNnl2gW/view?usp=sharing)

🔐 **Demo Credentials**  
The live application is protected to prevent abuse of the AI models. For access credentials, please contact **kinjal@panscience.ai**.

CDSCO RegAI is an advanced AI-powered platform designed to automate and streamline regulatory workflows for the Central Drugs Standard Control Organisation (CDSCO). It leverages state-of-the-art Large Language Models to process, analyze, and manage regulatory documents such as Clinical Trial Applications, New Drug Applications, and Serious Adverse Event (SAE) reports.

## 🚀 Features

The application offers multiple AI-driven capabilities:

1. **Secure Authentication & Access Control**: Robust login system securing API endpoints and UI, ensuring only authorised personnel can access sensitive regulatory data.
2. **Document Classification & Extraction**: Automatically classifies uploaded documents and extracts critical metadata (e.g., application type, risk level) using LLMs, with full field transparency and "Mark as Duplicate" human overrides based on dynamic similarity sliders.
3. **Completeness Check**: Validates submission documents against CDSCO checklists, generating scores with transparent mathematical visualisations and a human-in-the-loop "Mark as Complete" override.
4. **Semantic Document Comparison**: Compares different versions of regulatory documents generating a semantic change analysis, paired with an interactive side-by-side split-pane UI that visually highlights line-level differences.
5. **Intelligent Summarisation & Q&A Chatbot**: Generates structured summaries of lengthy dossiers and features a contextual "Ask a Question" chatbot allowing reviewers to interactively query the document's contents.
6. **PII Anonymisation**: Redacts PII/PHI via a 3-layer pipeline for DPDP Act compliance. Authorised users can securely download the original, unredacted PDF, demonstrating verifiable reversibility.
7. **Inspection Report Generation**: Analyzes field notes and automatically drafts structured, compliant inspection reports, exporting directly to multi-sheet `.xlsx` workbooks complete with Risk Registers.
8. **Workflow Persistence (History)**: An integrated History module and per-tab persistence ensure that reviewers never lose their recent analysis results when switching tasks.

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

#### Backend Variables
Create a `.env` file in the root directory (use `.env.example` as a template):
```env
GEMINI_API_KEY=your_llm_api_key
GEMINI_MODEL=your_llm_model_name
DATABASE_URL=postgresql://user:password@localhost:5432/cdsco_regai
TOKEN_ENCRYPTION_KEY=your_base64_fernet_key
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=ap-south-1
S3_BUCKET=your_s3_bucket
```

#### Frontend Variables
Create a `.env` file inside the `frontend/` directory:
```env
VITE_APP_ADMIN_PASSWORD=your_secure_password
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
