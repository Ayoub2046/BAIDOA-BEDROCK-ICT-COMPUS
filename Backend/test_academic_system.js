// Backend/test_academic_system.js
const { query } = require('./database.js');

async function testSystem() {
    console.log('========================================================');
    console.log('🧪 VERIFYING ACADEMIC ARCHITECTURE & INTEGRATIONS');
    console.log('========================================================');
    let errors = 0;

    // 1. Check admission_batches
    try {
        const { rows: batches } = await query(`SELECT * FROM admission_batches WHERE deleted_at IS NULL ORDER BY id`);
        console.log(`✓ [Admission Batches] Found ${batches.length} active batch(es):`);
        batches.forEach(b => console.log(`   - Year: ${b.year_label} | Prefix: ${b.id_prefix} | Sep: "${b.id_separator}" | Digits: ${b.id_digits} | Active: ${b.is_active}`));
        if (batches.length === 0) throw new Error('No admission batches found');
    } catch (e) {
        console.error('❌ Admission batches test failed:', e.message);
        errors++;
    }

    // 2. Check students and student_id_codes
    let testStudent = null;
    try {
        const { rows: students } = await query(`SELECT id, name, grade, student_id_code, status, academic_year FROM students WHERE deleted_at IS NULL ORDER BY id LIMIT 5`);
        console.log(`✓ [Students Table] Verified students with permanent codes:`);
        students.forEach(s => console.log(`   - ID: ${s.id} | Code: ${s.student_id_code} | Name: ${s.name} | Status: ${s.status} | Year: ${s.academic_year}`));
        if (students.length === 0) throw new Error('No students found');
        testStudent = students[0];
    } catch (e) {
        console.error('❌ Students test failed:', e.message);
        errors++;
    }

    // 3. Test Student Auth Login with student_id_code
    if (testStudent) {
        try {
            const { rows: authRows } = await query(`SELECT plain_password FROM student_auth WHERE student_id = $1`, [testStudent.id]);
            const plainPwd = authRows[0]?.plain_password;
            if (!plainPwd) {
                console.log(`⚠️ Student ID ${testStudent.id} has no plain password recorded.`);
            } else {
                console.log(`✓ [Student Auth] Student ${testStudent.student_id_code} has login credentials configured.`);
            }
        } catch (e) {
            console.error('❌ Student Auth check failed:', e.message);
            errors++;
        }
    }

    // 4. Test Student Academic History Snapshot
    if (testStudent) {
        try {
            const { rows: history } = await query(`SELECT * FROM student_academic_history WHERE student_id = $1`, [testStudent.id]);
            console.log(`✓ [Academic History] Found ${history.length} snapshot record(s) for student ID ${testStudent.id}.`);
        } catch (e) {
            console.error('❌ Academic history check failed:', e.message);
            errors++;
        }
    }

    // 5. Check Exam Periods
    try {
        const { rows: periods } = await query(`SELECT id, name, academic_year, period_type, month, is_locked, is_published, is_archived FROM exam_periods WHERE deleted_at IS NULL ORDER BY id`);
        console.log(`✓ [Exam Periods] Verified ${periods.length} exam period(s):`);
        periods.forEach(p => console.log(`   - [${p.id}] ${p.name} | Year: ${p.academic_year} | Type: ${p.period_type} | Month: ${p.month || 'N/A'} | Locked: ${p.is_locked}`));
    } catch (e) {
        console.error('❌ Exam periods check failed:', e.message);
        errors++;
    }

    // 6. Check Certificates Table Schema & Data
    try {
        const { rows: certs } = await query(`SELECT id, student_id, title, cert_type, certificate_number, academic_year, is_published FROM certificates WHERE deleted_at IS NULL LIMIT 5`);
        console.log(`✓ [Certificates] Found ${certs.length} certificate(s):`);
        certs.forEach(c => console.log(`   - [${c.id}] ${c.title} (${c.cert_type}) | No: ${c.certificate_number} | Year: ${c.academic_year}`));
    } catch (e) {
        console.error('❌ Certificates check failed:', e.message);
        errors++;
    }

    // 7. Check Digital Library Resources
    try {
        const { rows: books } = await query(`SELECT id, title, author, category, subject, academic_year, target_audience, file_path FROM books WHERE deleted_at IS NULL LIMIT 5`);
        console.log(`✓ [Digital Library] Found ${books.length} resource(s):`);
        books.forEach(b => console.log(`   - [${b.id}] "${b.title}" by ${b.author} | Cat: ${b.category} | Subj: ${b.subject || 'All'} | Audience: ${b.target_audience}`));
    } catch (e) {
        console.error('❌ Digital Library check failed:', e.message);
        errors++;
    }

    console.log('========================================================');
    if (errors === 0) {
        console.log('🎉 ALL ACADEMIC ARCHITECTURE DATABASE CHECKS PASSED!');
    } else {
        console.log(`⚠️ Completed with ${errors} error(s).`);
    }
    console.log('========================================================');
    process.exit(errors === 0 ? 0 : 1);
}

testSystem();
