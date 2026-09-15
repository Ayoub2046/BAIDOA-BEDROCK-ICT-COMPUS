// Backend/test_history_query.js
const { query } = require('./database.js');

async function testHistory() {
    const studentId = 1;
    console.log('Testing queries for /api/students/:id/academic-history...');
    try {
        const { rows: studentRows } = await query(`
            SELECT s.*, b.year_label AS batch_year 
            FROM students s
            LEFT JOIN admission_batches b ON b.id = s.admission_batch_id
            WHERE s.id = $1 AND s.deleted_at IS NULL
        `, [studentId]);
        console.log('✓ studentRows OK');
    } catch(e) { console.error('studentRows error:', e.message); }

    try {
        const { rows: historyRecords } = await query(`
            SELECT * FROM student_academic_history 
            WHERE student_id = $1 ORDER BY academic_year DESC, id DESC
        `, [studentId]);
        console.log('✓ historyRecords OK');
    } catch(e) { console.error('historyRecords error:', e.message); }

    try {
        const { rows: examResults } = await query(`
            SELECT r.*, ep.name AS period_name, ep.period_type, ep.month, ep.year,
                   c.name AS class_name
            FROM results r
            LEFT JOIN exam_periods ep ON ep.id = r.period_id
            LEFT JOIN classes c ON c.id = r.classid
            WHERE r.student_id = $1 AND r.deleted_at IS NULL
            ORDER BY r.academic_year DESC, r.period_id DESC, r.id ASC
        `, [studentId]);
        console.log('✓ examResults OK');
    } catch(e) { console.error('examResults error:', e.message); }

    try {
        const { rows: certs } = await query(`
            SELECT * FROM certificates 
            WHERE student_id = $1 AND deleted_at IS NULL
            ORDER BY issue_date DESC, id DESC
        `, [studentId]);
        console.log('✓ certs OK');
    } catch(e) { console.error('certs error:', e.message); }

    try {
        const { rows: enrolledClasses } = await query(`
            SELECT cs.*, c.name AS class_name, c.room, c.color
            FROM class_students cs
            JOIN classes c ON c.id = cs.class_id
            WHERE cs.student_id = $1 AND cs.deleted_at IS NULL
            ORDER BY cs.assigned_at DESC
        `, [studentId]);
        console.log('✓ enrolledClasses OK');
    } catch(e) { console.error('enrolledClasses error:', e.message); }

    process.exit(0);
}

testHistory();
