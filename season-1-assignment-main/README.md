# AI-Powered Resume Shortlisting & Candidate Tracking System

An intelligent hiring assistant built for HR teams and recruiters to automate resume screening, candidate ranking, fraud detection, shortlisting, and follow-up management.

---

## 🚀 Features

- Google Login with secure authentication
- Gmail inbox access for fetching resumes
- AI-powered resume analysis using Groq LLM
- Candidate ranking and scoring
- Top 10 automatic shortlisting
- Fraud / duplicate detection
- Follow-up tracking
- Role-based job requirement matching
- Multi-user secure data isolation
- Per-HR private dashboard using Supabase RLS
- Resume upload via drag & drop (PDF, DOCX)
- Interactive analytics with charts

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS |
| State Management | Zustand |
| Backend / DB | Supabase (PostgreSQL) |
| Authentication | Google OAuth via Supabase |
| AI Engine | Groq LLM (resume analysis) |
| Email Access | Gmail API |
| Routing | React Router v7 |
| Charts | Recharts |
| PDF Parsing | pdfjs-dist |
| DOCX Parsing | Mammoth |

---

## 📦 Prerequisites

- Node.js >= 18
- npm >= 9
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com) API key
- Google OAuth credentials (with Gmail API enabled)

---

## ⚙️ Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd season-1-assignment-main
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root of the project:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GROQ_API_KEY=your_groq_api_key
```

### 4. Run the development server

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
```

### 6. Preview production build

```bash
npm run preview
```

---

## 🔐 Login & Authentication

### Step 1: Login
Click **Continue with Google** on the login page.

The application uses **Google OAuth via Supabase authentication**.

After successful login:

- Your profile is created securely
- Your private workspace is generated
- All data is linked to your account using `hr_user_id`

---

## 📩 Permissions Requested

The application may request the following permissions:

### 1. Basic Profile Access
Used to identify the HR user securely.

Includes:
- name
- email
- profile image

---

### 2. Gmail Read Access
Used to fetch candidate resumes from emails.

Access required:
- Read emails
- Read attachments / resumes
- Read sender details
- Read received date

This is used only for:
- fetching resumes
- extracting candidate details
- AI comparison

---

### 3. Gmail Send Access
Used to send automated follow-up emails.

This is used only for:
- shortlist emails
- next-round interview emails
- follow-up reminders

---

## ⚠ Google Verification Warning

You may see this screen:

**"Google hasn't verified this app"**

This happens because the app is currently in **testing mode**.

To continue:

1. Click **Advanced**
2. Click **Go to project name (unsafe)**
3. Continue login

This is safe for testing and internal usage.

---

## 📌 How It Works (Step-by-Step)

### Step 1: Login
Login using your Google account.

---

### Step 2: Create Job Role
Go to **Job Roles** and create a role with:

- title
- description
- required skills
- experience level
- tools
- requirements

Example:
```
Frontend Developer
React, TypeScript, Tailwind, REST APIs
2+ years experience
```

---

### Step 3: Upload or Fetch Resumes
- **Upload manually** via drag & drop (PDF or DOCX)
- **Fetch from Gmail** — the app scans your inbox for resume attachments

---

### Step 4: AI Analysis
The AI engine (powered by Groq) automatically:
- Parses each resume
- Compares it against the job role requirements
- Scores and ranks candidates

---

### Step 5: Review Shortlist
- View the top-ranked candidates
- See detailed match scores and reasoning
- Detect duplicates or fraudulent applications

---

### Step 6: Send Follow-ups
Send shortlist or interview invitation emails directly from the dashboard.

---

## 🗃 Project Structure

```
src/
├── components/       # Reusable UI components
├── pages/            # Page-level route components
├── services/         # API & external service integrations
├── store/            # Zustand global state stores
├── lib/              # Utility libraries and helpers
├── types/            # TypeScript type definitions
└── assets/           # Static assets
supabase/             # Supabase config & migrations
public/               # Public static files
```

---

## 🚀 Deployment

This project is configured for deployment on **Vercel**.

The `vercel.json` file handles SPA routing rewrites automatically.

To deploy:

```bash
npm run build
# Deploy the `dist/` folder to Vercel
```

Or connect your GitHub repository to Vercel for automatic deployments on push.

---

## 📄 License

This project is private and intended for internal/assignment use only.
