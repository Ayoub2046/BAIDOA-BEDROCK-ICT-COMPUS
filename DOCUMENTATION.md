# Baidoa Bedrock ICT Campus — Complete System Documentation

> **Official Enterprise Documentation**  
> **System Name:** Baidoa Bedrock ICT Campus Management & Digital Credential Platform  
> **Version:** 2.5.0 (Production Release)  
> **Repository:** [Ayoub2046/BAIDOA-BEDROCK-ICT-COMPUS](https://github.com/Ayoub2046/BAIDOA-BEDROCK-ICT-COMPUS)  
> **Primary Technology Stack:** Node.js, Express.js, PostgreSQL (Pg Pool / Supabase), HTML5, Vanilla JavaScript, Bootstrap 5, FontAwesome, html5-qrcode.

---

## 1. Executive Summary & Platform Purpose

The **Baidoa Bedrock ICT Campus Management Platform** is an all-in-one, full-stack educational enterprise application engineered to streamline academic administration, fee clearance verification, digital identity credentials, attendance tracking, examination grading, direct messaging, and student admissions.

The system serves five core user roles across separate portals:
1. **Super Admin / School Administrator**: Complete system control, user management, admission batches, expense tracking, class assignments, result approvals, and database backup/restore.
2. **Teachers & Instructors**: Attendance recording, student grade entries, class management, exam supervision, direct messaging with students and parents.
3. **Students**: Real-time academic results viewing, fee clearance status, printable Exam Clearance Pass, official Digital Student ID Card generation, library access, and GPA what-if calculations.
4. **Parents / Guardians**: Student progress monitoring, attendance tracking, fee payment status, and direct inquiry messaging with school administration.
5. **Campus Security & Bursar Staff**: Mobile QR scanner verification interface to scan student ID cards and exam clearance passes at campus gates and examination halls.

---

## 2. Technical Stack & Architecture

### 2.1 Backend Core
- **Runtime Environment:** Node.js (v18+)
- **Web Framework:** Express.js (`server.js`)
- **Database Engine:** PostgreSQL (Native Pg Client Pool `pg` with Supabase SSL connection fallback)
- **Security & Cryptography:** `bcrypt` for password hashing, `jsonwebtoken` (JWT) for session management
- **File & Media Handling:** Base64 Data URL inline encoding for zero-dependency image persistence, `multer` for multipart form data fallback
- **Export Utility:** Native CSV generator, PDF report handlers

### 2.2 Frontend Architecture
- **Structure:** Semantic HTML5, Modular Multi-Page Architecture (MPA)
- **Styling:** Custom Vanilla CSS with Design System Tokens (`index.css`), Bootstrap 5 CSS Framework, Dark/Light Mode Theme Engine
- **Typography & Icons:** FontAwesome Pro 6 Icons, Google Fonts (Inter, Roboto, Courier New)
- **Client Scripts:** Native JavaScript (ES6+ Async/Await, Fetch API)
- **Interactive Libraries:**
  - `QRCode.js`: Client-side QR code rendering for Digital ID & Exam Clearance verification
  - `html5-qrcode`: WebRTC live camera QR code scanner for Security/Bursar verification
  - `html2canvas`: Canvas rasterization for downloading high-resolution PNG ID cards

---

## 3. Database Schema & Data Models

The system utilizes PostgreSQL with automated schema migrations on startup (`server.js` startup queries).

```mermaid
erDiagram
    USERS ||--o{ STUDENTS : "parent of"
    CLASSES ||--o{ STUDENTS : "enrolled in"
    STUDENTS ||--o{ RESULTS : "achieves"
    STUDENTS ||--o{ ATTENDANCE : "has"
    STUDENTS ||--o{ STUDENT_AUTH : "authenticates with"
    STUDENTS ||--o{ EXAM_ATTENDANCE : "participates in"
    EXAM_PERIODS ||--o{ EXAM_SCHEDULES : "contains"
    EXAM_SCHEDULES ||--o{ EXAM_ATTENDANCE : "records"
    USERS ||--o{ MESSAGES : "sends/receives"

    USERS {
        int id PK
        string name
        string email
        string role
        string phone
        boolean isactive
    }
    STUDENTS {
        int id PK
        string name
        string student_id_code
        string grade
        string phone
        text image
        int parentid FK
        int classid FK
        string status
        timestamp deleted_at
    }
    STUDENT_AUTH {
        int student_id PK,FK
        string password_hash
        string plain_password
    }
```

### 3.1 Primary Database Tables

| Table Name | Description | Key Columns |
| :--- | :--- | :--- |
| `users` | System users (Admins, Teachers, Parents) | `id`, `name`, `email`, `role`, `phone`, `password`, `image`, `isactive` |
| `students` | Master student directory | `id`, `name`, `student_id_code`, `grade`, `phone`, `image`, `parentid`, `classid`, `status`, `deleted_at` |
| `student_auth` | Student portal login credentials | `student_id`, `password_hash`, `plain_password`, `must_change`, `last_changed` |
| `classes` | Class rooms and grades | `id`, `name`, `teacher_id`, `academic_year`, `room`, `capacity` |
| `class_students` | Junction table for student-class assignments | `class_id`, `student_id`, `assigned_at` |
| `attendance` | Daily student attendance records | `id`, `student_id`, `date`, `status`, `remarks` |
| `results` | Student exam marks and grades | `id`, `student_id`, `subject`, `score`, `grade`, `term`, `academic_year`, `status` |
| `fee_clearance` | Bursar clearance status | `id`, `student_id`, `academic_year`, `term`, `is_cleared`, `released_by` |
| `expenses` | Campus financial expenses | `id`, `title`, `category`, `amount`, `date`, `description` |
| `exam_periods` | Exam terms/semesters setup | `id`, `name`, `start_date`, `end_date`, `is_active` |
| `exam_schedules` | Individual exam timetable slots | `id`, `exam_period_id`, `subject`, `exam_date`, `start_time`, `end_time`, `room` |
| `exam_attendance` | Verification logs for exam entry | `id`, `exam_schedule_id`, `student_id`, `status`, `scanned_by` |
| `messages` | Direct messaging thread records | `id`, `sender_id`, `receiver_id`, `message`, `sent_at`, `read` |
| `recycle_bin` | Soft-deleted records for recovery | `id`, `table_name`, `original_id`, `data`, `deleted_at` |

---

## 4. API Endpoints Reference

The Express backend exposes 36 REST API route modules under `/api/*`:

### 4.1 Authentication & User Management
- `POST /api/auth/login` — Authenticate Admin, Teacher, or Parent users
- `POST /api/student-auth/login` — Authenticate Students using Student ID Code + Password
- `POST /api/activation/activate` — First-time account activation using secure token

### 4.2 Student Operations (`/api/students`)
- `GET /api/students` — Fetch list of students (supports search query, class filter)
- `GET /api/students/:id` — Fetch complete student profile (includes parent name, class details, image, phone)
- `POST /api/students` — Create new student record with auto-generated or custom Student ID Code
- `PUT /api/students/:id` — Update student record (name, grade, photo Data URL, phone, parent assignment)
- `DELETE /api/students/:id` — Move student record to Recycle Bin (soft delete)

### 4.3 Digital Credentials & Clearance (`/api/clearance`)
- `GET /api/clearance/student/:id` — Get fee clearance status for student
- `POST /api/clearance/update` — Toggle student fee clearance status (Bursar authorization)

### 4.4 Examination & Results (`/api/results`, `/api/exam-schedules`)
- `GET /api/results/student/:id` — Fetch complete transcript for student
- `POST /api/results` — Submit or batch-update student exam marks
- `PUT /api/results/approve` — Approve pending exam marks for official release
- `GET /api/exam-schedules` — Get active examination timetable slots

---

## 5. Digital Credentials Engine (ID & Clearance Passes)

One of the standout features of the Baidoa Bedrock ICT Campus Platform is its **Tamper-Proof Digital Credential System**.

```
+-------------------------------------------------------------------------------+
|                        OFFICIAL CAMPUS CREDENTIAL                             |
|                        Baidoa Bedrock ICT Campus                              |
|===============================================================================|
|  +--------------+   STUDENT NAME: Asma Abdullahi Munin                        |
|  |              |   STUDENT ID NUMBER: BB260001                               |
|  |  [STUDENT]   |   CLASS / GRADE: BC01-3PM                                   |
|  |   [PHOTO]    |   PHONE NUMBER: +252 61 500 0000                            |
|  +--------------+                                                             |
|-------------------------------------------------------------------------------|
|  Baidoa Registrar                                      [QR CODE]    (v) ACTIVE |
|  Valid: 2026 - 2028                                                           |
+-------------------------------------------------------------------------------+
```

### 5.1 Technical Implementation Details
1. **Base64 Photo Persistence Pipeline**:
   - When an administrator uploads a student photo in `student.html`, the browser converts the file into a compressed Base64 Data URL (`data:image/jpeg;base64,...`).
   - The Base64 string is saved directly into the PostgreSQL `students.image` column.
   - **Advantage**: Eliminates missing image dependencies, static server path errors, or external URL expiry.

2. **Standardized Card Geometry (680px Width)**:
   - Both the **Digital Student ID Card** (`HTML/Student Results.html`) and the **Exam Clearance Pass Card** (`HTML/verify-clearance.html`) are designed with a standardized **`680px` max-width aspect ratio**.
   - Styled with a navy/gold luxury gradient (`#0c2340` to `#133560`), 2.5px gold accent border (`#d4af37`), rounded corners (`20px`), and gold seal branding.

3. **Real-Time Data Binding**:
   - Whenever a student or bursar opens the Digital ID or Exam Clearance modal, the system executes an asynchronous `fetch('/api/students/' + studentId)` call to ensure live profile data (name, ID code, class, phone, photo, clearance status) is populated in real time.

4. **Dynamic QR Code Verification Workflow**:
   - Each card dynamically embeds a high-density QR code pointing directly to the campus verification gateway:
     - Digital ID QR: `https://[domain]/HTML/verify-id.html?id=[studentId]&code=[bbCode]`
     - Clearance Pass QR: `https://[domain]/HTML/verify-clearance.html?id=[studentId]`
   - Scanning the card via mobile camera or campus scanner loads a verified green badge status page showing student authenticity.

---

## 6. Portals & User Roles Walkthrough

### 6.1 Admin & Super Admin Portal (`student.html`, `admin.html`)
- **Student Management**: Full CRUD for student directory, custom ID format generator, live photo upload/preview, parent account linking.
- **Recycle Bin (`recycle-bin.html`)**: Allows restoring accidentally deleted students or permanently purging data.
- **Financial Expenses (`expenses.html`)**: Log campus operational costs, generate category reports.
- **Results Approval (`results-approval.html`)**: Review grades submitted by teachers before publishing them to student portals.

### 6.2 Student Portal (`Student Results.html`)
- **Results & Transcripts**: Interactive GPA summary, letter grade breakdown, term-by-term filtering.
- **What-If GPA Calculator**: Allows students to simulate potential scores to estimate projected semester GPAs.
- **Exam Clearance Pass Modal**: Generates official green printable Clearance Pass with fee status badge and verification QR code.
- **Official Digital ID Card**: Generates 680px Navy & Gold ID card with instant PNG download (`html2canvas`) and print support.

### 6.3 Mobile Verification Scanner (`seceurity.html`)
- Integrated with `html5-qrcode` library for WebRTC camera scanning.
- Security guards and exam hall invigilators scan student cards at campus entry points.
- Instant visual alert: **GREEN (ACCESS GRANTED)** or **RED (UNPAID / NOT CLEARED)**.

---

## 7. Security & Data Protection

- **Password Cryptography**: All passwords stored using standard `bcrypt` hashing with salt rounds.
- **Session Tokens**: Protected endpoints require JSON Web Tokens (`jwt`) sent via HTTP headers.
- **Database Safety**: Prepared SQL queries (`$1, $2, ...`) throughout all backend routes prevent SQL Injection attacks.
- **Soft Deletion**: Student deletions populate `recycle_bin` and set `deleted_at = NOW()`, preventing accidental data loss.

---

## 8. Installation & Deployment Guide

### 8.1 Local Environment Setup

1. **Clone Repository & Install Dependencies**:
   ```bash
   git clone https://github.com/Ayoub2046/BAIDOA-BEDROCK-ICT-COMPUS.git
   cd BAIDOA-BEDROCK-ICT-COMPUS
   npm install
   cd Backend && npm install
   ```

2. **Configure Environment Variables (`Backend/.env`)**:
   ```env
   PORT=3000
   DATABASE_URL=postgres://username:password@localhost:5432/baidoa_bedrock_db
   JWT_SECRET=your_super_secret_jwt_key
   ```

3. **Initialize Database Schema**:
   ```bash
   node Backend/run-schema.js
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open browser at: `http://localhost:3000`

---

## 9. Maintainer & Version Control

- **Lead Developer**: Ayoub (Ayoub2046)
- **Campus**: Baidoa Bedrock ICT Campus
- **Branch**: `main`
- **Latest Commit**: `style(digital-id): make digital ID card size match clearance pass card size exactly (680px max-width)`

---
*Documentation automatically generated & verified for Baidoa Bedrock ICT Campus Production Release 2026.*
