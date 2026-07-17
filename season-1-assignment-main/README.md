# AI-Powered Resume Shortlisting & Candidate Tracking System

An intelligent hiring assistant built for HR teams and recruiters to automate resume screening, candidate ranking, fraud detection, shortlisting, and follow-up management.

---

## 🚀 Features

- Google Login with secure authentication
- Gmail inbox access for fetching resumes
- AI-powered resume analysis
- Candidate ranking and scoring
- Top 10 automatic shortlisting
- Fraud / duplicate detection
- Follow-up tracking
- Role-based job requirement matching
- Multi-user secure data isolation
- Per-HR private dashboard using Supabase RLS

---

## 🛠 Tech Stack

- Frontend: React + Vite + TypeScript
- Backend: Supabase
- Authentication: Google OAuth
- Database: PostgreSQL (Supabase)
- AI Engine: LLM-based resume comparison
- Email Access: Gmail API

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
Login using Google account.

---

### Step 2: Create Job Role
Go to **Job Roles**

Create a role with:

- title
- description
- required skills
- experience level
- tools
- requirements

Example:

```text id="n6f2r4"
Frontend Developer
React, TypeScript, Tailwind, REST APIs
2+ years experience
```
